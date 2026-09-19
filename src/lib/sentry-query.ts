/**
 * Pure helpers for reading agent telemetry back out of Sentry: request builders and row
 * summarizers with no I/O and no secrets, so they can be unit-tested. The server-only fetcher
 * in sentry-metrics.ts wires them to the Sentry API.
 *
 * The worker emits `underwriting.*` trace metrics and `agent.*` spans (see src/agent/monitoring.ts).
 * Sentry exposes them through the organization events API: trace metrics under
 * `dataset=tracemetrics`, spans under `dataset=spans`, and errors under `dataset=errors`.
 */
export const SENTRY_PERIOD_DAYS = 30;
const PERIOD = `${SENTRY_PERIOD_DAYS}d`;

export type SentryConfig = { token: string; org: string; project: string; apiUrl: string };

export function sentryConfig(env: Record<string, string | undefined> = process.env): SentryConfig | null {
  const token = env.SENTRY_AUTH_TOKEN?.trim();
  if (!token) return null;
  return {
    token,
    org: env.SENTRY_ORG?.trim() || "astra-risk",
    project: env.SENTRY_PROJECT?.trim() || "astra-risk",
    apiUrl: (env.SENTRY_API_URL?.trim() || "https://us.sentry.io").replace(/\/+$/, ""),
  };
}

export type MetricRow = {
  "metric.name": string;
  source?: string | null; outcome?: string | null; status?: string | null;
  model?: string | null; kind?: string | null; fixture?: string | null;
  "sum(value)"?: number | null; "count(value)"?: number | null; "avg(value)"?: number | null; "p95(value)"?: number | null;
};
export type SpanRow = { "span.description": string; "count()"?: number | null; "avg(span.duration)"?: number | null; "p95(span.duration)"?: number | null };
export type ErrorRow = { "count()"?: number | null; "count_unique(issue)"?: number | null };
export type LatestEvalRow = { value?: number | null; timestamp?: string | null; model?: string | null };

export type ActivityStat = { name: string; count: number; avgMs: number | null; p95Ms: number | null };
export type EvalCaseStat = { fixture: string; pass: number; fail: number; avgMs: number | null };
export type EvalPoint = { date: string; accuracy: number | null };

export type SentryMetrics = {
  configured: boolean;
  ok: boolean;
  problems: string[];
  periodDays: number;
  fetchedAt: string | null;
  org: string | null;
  project: string | null;
  links: { issues: string; metrics: string; traces: string } | null;
  errors: { events: number; issues: number };
  extraction: { gemini: number; parser: number };
  modelDuration: { avgMs: number | null; p95Ms: number | null; samples: number; model: string | null };
  analysis: { ready: number; referred: number; brokerNeeded: number; avgReferrals: number | null };
  decisions: { approved: number; declined: number };
  jobs: { completed: number; retried: number; failed: number; avgMs: number | null; p95Ms: number | null };
  eval: {
    latestAccuracy: number | null; latestAt: string | null; latestModel: string | null;
    runs: number; passedRuns: number; avgAccuracy: number | null; avgDurationMs: number | null;
    series: EvalPoint[]; cases: EvalCaseStat[];
  };
  activities: ActivityStat[];
};

export function emptySentryMetrics(configured: boolean, problems: string[] = []): SentryMetrics {
  return {
    configured, ok: false, problems, periodDays: SENTRY_PERIOD_DAYS, fetchedAt: null, org: null, project: null, links: null,
    errors: { events: 0, issues: 0 },
    extraction: { gemini: 0, parser: 0 },
    modelDuration: { avgMs: null, p95Ms: null, samples: 0, model: null },
    analysis: { ready: 0, referred: 0, brokerNeeded: 0, avgReferrals: null },
    decisions: { approved: 0, declined: 0 },
    jobs: { completed: 0, retried: 0, failed: 0, avgMs: null, p95Ms: null },
    eval: { latestAccuracy: null, latestAt: null, latestModel: null, runs: 0, passedRuns: 0, avgAccuracy: null, avgDurationMs: null, series: [], cases: [] },
    activities: [],
  };
}

function events(config: SentryConfig, projectId: string, params: [string, string][]): string {
  const search = new URLSearchParams([["project", projectId], ["statsPeriod", PERIOD], ...params]);
  return `${config.apiUrl}/api/0/organizations/${encodeURIComponent(config.org)}/events/?${search}`;
}

/** One grouped query returns every underwriting metric with the attributes the worker attaches. */
export function metricsRequest(config: SentryConfig, projectId: string): string {
  const fields = ["metric.name", "source", "outcome", "status", "model", "kind", "fixture", "sum(value)", "count(value)", "avg(value)", "p95(value)"];
  return events(config, projectId, [["dataset", "tracemetrics"], ...fields.map((field): [string, string] => ["field", field]), ["query", "metric.name:underwriting.*"], ["per_page", "100"]]);
}

export function errorsRequest(config: SentryConfig, projectId: string): string {
  return events(config, projectId, [["dataset", "errors"], ["field", "count()"], ["field", "count_unique(issue)"], ["query", "!level:info !level:debug"]]);
}

export function spansRequest(config: SentryConfig, projectId: string): string {
  const fields = ["span.description", "count()", "avg(span.duration)", "p95(span.duration)"];
  return events(config, projectId, [["dataset", "spans"], ...fields.map((field): [string, string] => ["field", field]), ["query", "span.op:[agent.activity,agent.job,agent.eval]"], ["sort", "-count()"], ["per_page", "25"]]);
}

export function latestEvalRequest(config: SentryConfig, projectId: string): string {
  return events(config, projectId, [["dataset", "tracemetrics"], ["field", "value"], ["field", "timestamp"], ["field", "model"], ["query", "metric.name:underwriting.eval_accuracy"], ["sort", "-timestamp"], ["per_page", "1"]]);
}

export function evalSeriesRequest(config: SentryConfig, projectId: string): string {
  const search = new URLSearchParams([
    ["project", projectId], ["statsPeriod", PERIOD], ["dataset", "tracemetrics"], ["interval", "1d"],
    ["yAxis", "avg(value)"], ["yAxis", "count(value)"], ["query", "metric.name:underwriting.eval_accuracy"],
  ]);
  return `${config.apiUrl}/api/0/organizations/${encodeURIComponent(config.org)}/events-stats/?${search}`;
}

export function projectRequest(config: SentryConfig): string {
  return `${config.apiUrl}/api/0/projects/${encodeURIComponent(config.org)}/${encodeURIComponent(config.project)}/`;
}

export function sentryLinks(config: SentryConfig, projectId: string): SentryMetrics["links"] {
  const hosted = /(^|\.)sentry\.io$/.test(new URL(config.apiUrl).hostname);
  const base = hosted ? `https://${config.org}.sentry.io` : `${config.apiUrl}/organizations/${config.org}`;
  const scope = `project=${projectId}&statsPeriod=${PERIOD}`;
  return {
    issues: `${base}/issues/?${scope}`,
    metrics: `${base}/explore/metrics/?${scope}`,
    traces: `${base}/explore/traces/?${scope}&query=${encodeURIComponent("span.op:agent.activity")}`,
  };
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullable(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function aggregate(rows: MetricRow[]) {
  const count = rows.reduce((total, row) => total + num(row["count(value)"]), 0);
  const sum = rows.reduce((total, row) => total + num(row["sum(value)"]), 0);
  const p95 = rows.map((row) => nullable(row["p95(value)"])).filter((value): value is number => value !== null);
  return { count, sum, avg: count ? sum / count : null, p95: p95.length ? Math.max(...p95) : null };
}

export function summarizeMetricRows(rows: MetricRow[]) {
  const named = (name: string) => rows.filter((row) => row["metric.name"] === name);
  const total = (name: string, attribute?: keyof MetricRow, value?: string) =>
    named(name).filter((row) => attribute === undefined || row[attribute] === value).reduce((sum, row) => sum + num(row["sum(value)"]), 0);

  const durations = named("underwriting.model_duration");
  const topModel = durations.slice().sort((a, b) => num(b["count(value)"]) - num(a["count(value)"]))[0];
  const model = aggregate(durations);
  const jobs = aggregate(named("underwriting.job_duration"));
  const accuracy = aggregate(named("underwriting.eval_accuracy"));
  const evalDuration = aggregate(named("underwriting.eval_duration"));

  const cases = new Map<string, EvalCaseStat>();
  const fixture = (row: MetricRow) => {
    const name = row.fixture || "unknown";
    const stat = cases.get(name) ?? { fixture: name, pass: 0, fail: 0, avgMs: null };
    cases.set(name, stat);
    return stat;
  };
  for (const row of named("underwriting.eval_case")) {
    const stat = fixture(row);
    if (row.outcome === "pass") stat.pass += num(row["sum(value)"]);
    else stat.fail += num(row["sum(value)"]);
  }
  for (const row of named("underwriting.eval_case_duration")) fixture(row).avgMs = nullable(row["avg(value)"]);

  return {
    extraction: { gemini: total("underwriting.extraction", "source", "gemini"), parser: total("underwriting.extraction", "source", "parser") },
    modelDuration: { avgMs: model.avg, p95Ms: topModel ? nullable(topModel["p95(value)"]) : null, samples: model.count, model: topModel?.model ?? null },
    analysis: {
      ready: total("underwriting.analysis", "outcome", "ready"),
      referred: total("underwriting.analysis", "outcome", "referred"),
      brokerNeeded: total("underwriting.analysis", "outcome", "broker_needed"),
      avgReferrals: aggregate(named("underwriting.referrals")).avg,
    },
    decisions: { approved: total("underwriting.decision", "status", "approved"), declined: total("underwriting.decision", "status", "declined") },
    jobs: {
      completed: total("underwriting.job", "outcome", "completed"),
      retried: total("underwriting.job", "outcome", "retried"),
      failed: total("underwriting.job", "outcome", "failed"),
      avgMs: jobs.avg, p95Ms: jobs.p95,
    },
    evalRuns: {
      runs: total("underwriting.eval_run"),
      passedRuns: total("underwriting.eval_run", "outcome", "passed"),
      avgAccuracy: accuracy.avg,
      avgDurationMs: evalDuration.avg,
      cases: [...cases.values()].sort((a, b) => a.fixture.localeCompare(b.fixture)),
    },
  };
}

export function summarizeSpanRows(rows: SpanRow[]): ActivityStat[] {
  return rows
    .map((row) => ({ name: row["span.description"], count: num(row["count()"]), avgMs: nullable(row["avg(span.duration)"]), p95Ms: nullable(row["p95(span.duration)"]) }))
    .filter((row) => row.name && row.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function summarizeErrorRows(rows: ErrorRow[]): SentryMetrics["errors"] {
  return { events: num(rows[0]?.["count()"]), issues: num(rows[0]?.["count_unique(issue)"]) };
}

export function summarizeLatestEval(rows: LatestEvalRow[]) {
  const row = rows[0];
  return { accuracy: nullable(row?.value), at: row?.timestamp ?? null, model: row?.model ?? null };
}

type SeriesBucket = [number, { count?: number | null }[]];

function seriesBuckets(raw: unknown, axis: string): SeriesBucket[] {
  if (!raw || typeof raw !== "object") return [];
  const keyed = (raw as Record<string, { data?: unknown }>)[axis];
  const data = keyed && typeof keyed === "object" ? keyed.data : (raw as { data?: unknown }).data;
  return Array.isArray(data) ? (data as SeriesBucket[]) : [];
}

/** Daily eval accuracy; a day without an eval run is null rather than zero, which the count axis tells apart. */
export function summarizeEvalSeries(raw: unknown): EvalPoint[] {
  const averages = seriesBuckets(raw, "avg(value)");
  const counts = new Map(seriesBuckets(raw, "count(value)").map(([timestamp, values]) => [timestamp, num(values?.[0]?.count)]));
  return averages.map(([timestamp, values]) => {
    const ran = counts.size ? (counts.get(timestamp) ?? 0) > 0 : num(values?.[0]?.count) > 0;
    return { date: new Date(timestamp * 1000).toISOString().slice(0, 10), accuracy: ran ? num(values?.[0]?.count) : null };
  });
}

export type SentrySources = {
  config: SentryConfig;
  projectId: string;
  fetchedAt: Date;
  problems: string[];
  metricRows: MetricRow[];
  errorRows: ErrorRow[];
  spanRows: SpanRow[];
  latestRows: LatestEvalRow[];
  series: unknown;
};

export function buildSentryMetrics(sources: SentrySources): SentryMetrics {
  const metrics = summarizeMetricRows(sources.metricRows);
  const latest = summarizeLatestEval(sources.latestRows);
  return {
    configured: true,
    ok: sources.problems.length === 0,
    problems: sources.problems,
    periodDays: SENTRY_PERIOD_DAYS,
    fetchedAt: sources.fetchedAt.toISOString(),
    org: sources.config.org,
    project: sources.config.project,
    links: sentryLinks(sources.config, sources.projectId),
    errors: summarizeErrorRows(sources.errorRows),
    extraction: metrics.extraction,
    modelDuration: metrics.modelDuration,
    analysis: metrics.analysis,
    decisions: metrics.decisions,
    jobs: metrics.jobs,
    eval: {
      latestAccuracy: latest.accuracy, latestAt: latest.at, latestModel: latest.model,
      runs: metrics.evalRuns.runs, passedRuns: metrics.evalRuns.passedRuns,
      avgAccuracy: metrics.evalRuns.avgAccuracy, avgDurationMs: metrics.evalRuns.avgDurationMs,
      series: summarizeEvalSeries(sources.series), cases: metrics.evalRuns.cases,
    },
    activities: summarizeSpanRows(sources.spanRows),
  };
}
