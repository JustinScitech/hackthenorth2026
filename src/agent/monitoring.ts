import * as Sentry from "@sentry/node";
import type { ModelAttempt } from "./model";
import type { Finding } from "../lib/types";

type Activity = (...args: unknown[]) => Promise<unknown>;
type Attributes = Record<string, string | number | boolean>;

export type EvalCaseResult = { name: string; ok: boolean; durationMs: number; model: string | null };
export type EvalRunResult = { passed: number; total: number; durationMs: number; model: string | null; cases: EvalCaseResult[] };

const enabled = () => Boolean(process.env.SENTRY_DSN);
let initialized = false;

/**
 * Initializes Sentry for a non-Next.js process (the worker or the eval script). Events carry only
 * error names, metric attributes, and span timings; broker text is never attached.
 */
export function initMonitoring(processName = "worker") {
  if (!enabled() || initialized) return;
  initialized = true;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 1),
    sendDefaultPii: false,
    serverName: processName,
    initialScope: { tags: { process: processName } },
    beforeSend(event) {
      if (event.request) delete event.request;
      return event;
    },
  });
}

export function captureAgentError(error: unknown, context: Attributes = {}) {
  if (!enabled()) return;
  const name = error instanceof Error ? error.name : "UnknownError";
  Sentry.withScope((scope) => {
    scope.setTag("agent.error", name);
    scope.setFingerprint(["agent-error", name]);
    scope.setContext("agent", context);
    Sentry.captureMessage(`Agent error: ${name}`, "error");
  });
}

export function startAgentSpan<T>(name: string, op: string, attributes: Attributes, run: () => Promise<T>): Promise<T> {
  if (!enabled()) return run();
  return Sentry.startSpan({ name, op, attributes }, run);
}

export function recordExtractionMetrics(attempts: ModelAttempt[]) {
  if (!enabled()) return;
  const model = attempts.find((attempt) => attempt.status === "completed");
  Sentry.metrics.count("underwriting.extraction", 1, { attributes: { source: model ? "gemini" : "parser" } });
  if (model) Sentry.metrics.distribution("underwriting.model_duration", model.durationMs, { unit: "millisecond", attributes: { model: model.model } });
}

export function recordAnalysisMetrics(findings: Finding[], needsBroker: boolean) {
  if (!enabled()) return;
  const referrals = findings.filter((finding) => finding.result === "refer").length;
  Sentry.metrics.count("underwriting.analysis", 1, { attributes: { outcome: needsBroker ? "broker_needed" : referrals ? "referred" : "ready" } });
  Sentry.metrics.distribution("underwriting.referrals", referrals);
}

export function recordDecisionMetric(status: "approved" | "declined") {
  if (enabled()) Sentry.metrics.count("underwriting.decision", 1, { attributes: { status } });
}

export function recordJobMetrics(kind: string, outcome: "completed" | "retried" | "failed", durationMs: number) {
  if (!enabled()) return;
  Sentry.metrics.count("underwriting.job", 1, { attributes: { kind, outcome } });
  Sentry.metrics.distribution("underwriting.job_duration", durationMs, { unit: "millisecond", attributes: { kind, outcome } });
}

/** Emits the aggregate and per-fixture results of `npm run eval:agent`, then flushes before the process exits. */
export async function recordEvalRun(run: EvalRunResult) {
  if (!enabled()) return;
  initMonitoring("eval");
  const model = run.model ?? "none";
  Sentry.metrics.gauge("underwriting.eval_accuracy", run.total ? run.passed / run.total : 0, { unit: "ratio", attributes: { model } });
  Sentry.metrics.count("underwriting.eval_run", 1, { attributes: { outcome: run.passed === run.total ? "passed" : "failed", model } });
  Sentry.metrics.distribution("underwriting.eval_duration", run.durationMs, { unit: "millisecond", attributes: { model } });
  for (const result of run.cases) {
    Sentry.metrics.count("underwriting.eval_case", 1, { attributes: { fixture: result.name, outcome: result.ok ? "pass" : "fail" } });
    Sentry.metrics.distribution("underwriting.eval_case_duration", result.durationMs, { unit: "millisecond", attributes: { fixture: result.name } });
  }
  await Sentry.flush(3000);
}

/** Wraps each activity in an `agent.activity` span so the trace shows extraction, research, and checks per job. */
export function monitorActivities<T extends object>(activities: T): T {
  if (!enabled()) return activities;
  return Object.fromEntries((Object.entries(activities) as [string, Activity][]).map(([name, activity]) => [
    name,
    (...args: unknown[]) => Sentry.startSpan({ name: `underwriting.${name}`, op: "agent.activity" }, async () => {
      try { return await activity(...args); }
      catch (error) { captureAgentError(error, { activity: name }); throw error; }
    }),
  ])) as T;
}
