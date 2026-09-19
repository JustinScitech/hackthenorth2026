import "server-only";
import {
  buildSentryMetrics, emptySentryMetrics, errorsRequest, evalSeriesRequest, latestEvalRequest, metricsRequest,
  projectRequest, sentryConfig, spansRequest,
  type ErrorRow, type LatestEvalRow, type MetricRow, type SentryConfig, type SentryMetrics, type SpanRow,
} from "./sentry-query";

export type { SentryMetrics } from "./sentry-query";

/**
 * This module reads the worker's telemetry back from the Sentry API for the overview dashboard.
 * The auth token is used only here, on the server. Results are cached for a minute because
 * the dashboard polls, and a partial failure still returns whatever queries succeeded.
 */
const SUCCESS_TTL_MS = 60_000;
const FAILURE_TTL_MS = 20_000;
const TIMEOUT_MS = 8_000;

const state = globalThis as unknown as {
  sentryMetricsCache?: { at: number; value: SentryMetrics };
  sentryMetricsInflight?: Promise<SentryMetrics>;
  sentryProjectId?: string;
};

function describe(error: unknown): string {
  if (error instanceof Error) return error.name === "TimeoutError" || error.name === "AbortError" ? "timed out" : error.message;
  return "unknown error";
}

async function sentryGet<T>(config: SentryConfig, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Sentry API responded ${response.status}`);
  return response.json() as Promise<T>;
}

async function projectId(config: SentryConfig): Promise<string> {
  if (state.sentryProjectId) return state.sentryProjectId;
  const project = await sentryGet<{ id: string | number }>(config, projectRequest(config));
  state.sentryProjectId = String(project.id);
  return state.sentryProjectId;
}

async function fetchSentryMetrics(config: SentryConfig): Promise<SentryMetrics> {
  let id: string;
  try {
    id = await projectId(config);
  } catch (error) {
    return emptySentryMetrics(true, [`Could not open Sentry project ${config.org}/${config.project}: ${describe(error)}.`]);
  }
  const problems: string[] = [];
  const rows = async <T,>(label: string, url: string, empty: T): Promise<T> => {
    try {
      return await sentryGet<T>(config, url);
    } catch (error) {
      problems.push(`${label} query failed: ${describe(error)}.`);
      return empty;
    }
  };
  type Table<R> = { data?: R[] };
  const [metrics, errors, spans, latest, series] = await Promise.all([
    rows<Table<MetricRow>>("Metrics", metricsRequest(config, id), {}),
    rows<Table<ErrorRow>>("Errors", errorsRequest(config, id), {}),
    rows<Table<SpanRow>>("Spans", spansRequest(config, id), {}),
    rows<Table<LatestEvalRow>>("Latest eval", latestEvalRequest(config, id), {}),
    rows<unknown>("Eval series", evalSeriesRequest(config, id), null),
  ]);
  return buildSentryMetrics({
    config, projectId: id, fetchedAt: new Date(), problems,
    metricRows: metrics.data ?? [], errorRows: errors.data ?? [], spanRows: spans.data ?? [], latestRows: latest.data ?? [], series,
  });
}

export async function getSentryMetrics(): Promise<SentryMetrics> {
  const config = sentryConfig();
  if (!config) return emptySentryMetrics(false, ["SENTRY_AUTH_TOKEN is not set."]);
  const cached = state.sentryMetricsCache;
  if (cached && Date.now() - cached.at < (cached.value.ok ? SUCCESS_TTL_MS : FAILURE_TTL_MS)) return cached.value;
  if (!state.sentryMetricsInflight) {
    state.sentryMetricsInflight = fetchSentryMetrics(config)
      .then((value) => { state.sentryMetricsCache = { at: Date.now(), value }; return value; })
      .finally(() => { state.sentryMetricsInflight = undefined; });
  }
  return state.sentryMetricsInflight;
}
