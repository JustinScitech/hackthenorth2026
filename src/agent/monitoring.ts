import * as Sentry from "@sentry/node";
import type { ModelAttempt } from "./model";
import type { Finding } from "../lib/types";

type Activity = (...args: unknown[]) => Promise<unknown>;

export function initMonitoring() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
    enableLogs: true,
    beforeSend(event) {
      return scrubEvent(event);
    },
  });
}

const SAFE_TEXT = /^[\w.:/@+-]{1,64}$/;
/** True for identifiers, model names, statuses, and enums; false for anything that reads like prose. */
function isSafeScalar(value: unknown): value is string | number | boolean {
  return typeof value === "number" || typeof value === "boolean" || (typeof value === "string" && SAFE_TEXT.test(value));
}

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubValue).filter((item) => item !== undefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, scrubValue(item)]).filter(([, item]) => item !== undefined));
  }
  return isSafeScalar(value) ? value : undefined;
}

/** Strips anything that could carry submission text before an event leaves the process. */
export function scrubEvent<T extends object>(event: T): T {
  const { request: _request, ...rest } = event as Record<string, unknown>;
  const scrubbed: Record<string, unknown> = { ...rest };
  for (const key of ["extra", "contexts", "tags", "user", "breadcrumbs"]) {
    if (key in scrubbed) scrubbed[key] = scrubValue(scrubbed[key]);
  }
  return scrubbed as T;
}

/** The only thing Sentry learns about an error: its class, never its message. */
export function agentErrorMessage(error: unknown): string {
  return `Agent error: ${error instanceof Error ? error.name : "UnknownError"}`;
}

/** Log attributes safe to ship: identifiers, counts, statuses; never free text. Lists become their length. */
export function redactForLog(detail: Record<string, unknown>): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (isSafeScalar(value)) attributes[key] = value;
    else if (Array.isArray(value)) attributes[key] = value.every(isSafeScalar) && value.length <= 8 ? value.join(",") : value.length;
  }
  return attributes;
}

/** Sentry Logs: one structured line per agent step with scrubbed attributes. */
export function logAgentEvent(message: string, detail: Record<string, unknown> = {}) {
  if (!process.env.SENTRY_DSN) return;
  Sentry.logger.info(message, redactForLog(detail));
}

export function captureAgentError(error: unknown) {
  if (process.env.SENTRY_DSN) Sentry.captureMessage(agentErrorMessage(error));
}

export function recordExtractionMetrics(attempts: ModelAttempt[]) {
  if (!process.env.SENTRY_DSN) return;
  const model = attempts.find((attempt) => attempt.status === "completed");
  Sentry.metrics.count("underwriting.extraction", 1, { attributes: { source: model ? "gemini" : "parser" } });
  if (model) Sentry.metrics.distribution("underwriting.model_duration", model.durationMs, { unit: "millisecond", attributes: { model: model.model } });
}

export function recordAnalysisMetrics(findings: Finding[], needsBroker: boolean) {
  if (!process.env.SENTRY_DSN) return;
  const referrals = findings.filter((finding) => finding.result === "refer").length;
  Sentry.metrics.count("underwriting.analysis", 1, { attributes: { outcome: needsBroker ? "broker_needed" : referrals ? "referred" : "ready" } });
  Sentry.metrics.distribution("underwriting.referrals", referrals);
}

export function recordDecisionMetric(status: "approved" | "declined") {
  if (process.env.SENTRY_DSN) Sentry.metrics.count("underwriting.decision", 1, { attributes: { status } });
}

export async function recordEvalMetric(passed: number, total: number) {
  if (!process.env.SENTRY_DSN) return;
  initMonitoring();
  Sentry.metrics.gauge("underwriting.eval_accuracy", total ? passed / total : 0, { unit: "ratio" });
  await Sentry.flush(2000);
}

export function monitorActivities<T extends object>(activities: T): T {
  if (!process.env.SENTRY_DSN) return activities;
  return Object.fromEntries((Object.entries(activities) as [string, Activity][]).map(([name, activity]) => [
    name,
    (...args: unknown[]) => Sentry.startSpan({ name: `underwriting.${name}`, op: "agent.activity" }, async () => {
      try { return await activity(...args); }
      catch (error) { captureAgentError(error); throw error; }
    }),
  ])) as T;
}
