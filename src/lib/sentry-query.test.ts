import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSentryMetrics, emptySentryMetrics, errorsRequest, evalSeriesRequest, metricsRequest, sentryConfig, sentryLinks,
  summarizeErrorRows, summarizeEvalSeries, summarizeLatestEval, summarizeMetricRows, summarizeSpanRows, type MetricRow,
} from "./sentry-query";

const config = { token: "sntryu_test_token_never_in_urls", org: "astra-risk", project: "astra-risk", apiUrl: "https://us.sentry.io" };

test("sentryConfig requires a token and defaults the org, project, and region", () => {
  assert.equal(sentryConfig({}), null);
  assert.equal(sentryConfig({ SENTRY_AUTH_TOKEN: "  " }), null);
  assert.deepEqual(sentryConfig({ SENTRY_AUTH_TOKEN: "abc" }), { token: "abc", org: "astra-risk", project: "astra-risk", apiUrl: "https://us.sentry.io" });
  assert.equal(sentryConfig({ SENTRY_AUTH_TOKEN: "abc", SENTRY_API_URL: "https://sentry.example.com/" })?.apiUrl, "https://sentry.example.com");
});

test("request builders target the events API with the project scope and never embed the token", () => {
  const metrics = new URL(metricsRequest(config, "42"));
  assert.equal(metrics.pathname, "/api/0/organizations/astra-risk/events/");
  assert.equal(metrics.searchParams.get("dataset"), "tracemetrics");
  assert.equal(metrics.searchParams.get("project"), "42");
  assert.equal(metrics.searchParams.get("statsPeriod"), "30d");
  assert.ok(metrics.searchParams.getAll("field").includes("p95(value)"));
  assert.equal(metrics.searchParams.get("query"), "metric.name:underwriting.*");
  assert.equal(new URL(errorsRequest(config, "42")).searchParams.get("dataset"), "errors");
  const series = new URL(evalSeriesRequest(config, "42"));
  assert.equal(series.pathname, "/api/0/organizations/astra-risk/events-stats/");
  assert.deepEqual(series.searchParams.getAll("yAxis"), ["avg(value)", "count(value)"]);
  for (const url of [metricsRequest(config, "42"), errorsRequest(config, "42"), evalSeriesRequest(config, "42")]) assert.ok(!url.includes(config.token));
});

test("sentryLinks use the org subdomain for hosted Sentry and the API host otherwise", () => {
  assert.equal(sentryLinks(config, "42")?.issues, "https://astra-risk.sentry.io/issues/?project=42&statsPeriod=30d");
  assert.match(sentryLinks({ ...config, apiUrl: "https://sentry.example.com" }, "42")?.metrics ?? "", /^https:\/\/sentry\.example\.com\/organizations\/astra-risk\/explore\/metrics\//);
});

const rows: MetricRow[] = [
  { "metric.name": "underwriting.extraction", source: "gemini", "sum(value)": 7, "count(value)": 7, "avg(value)": 1, "p95(value)": 1 },
  { "metric.name": "underwriting.extraction", source: "parser", "sum(value)": 2, "count(value)": 2, "avg(value)": 1, "p95(value)": 1 },
  { "metric.name": "underwriting.model_duration", model: "gemini-3.8-flash", "sum(value)": 6000, "count(value)": 3, "avg(value)": 2000, "p95(value)": 2500 },
  { "metric.name": "underwriting.model_duration", model: "gemini-3.5-flash-lite", "sum(value)": 1000, "count(value)": 1, "avg(value)": 1000, "p95(value)": 1000 },
  { "metric.name": "underwriting.analysis", outcome: "ready", "sum(value)": 4, "count(value)": 4, "avg(value)": 1, "p95(value)": 1 },
  { "metric.name": "underwriting.analysis", outcome: "broker_needed", "sum(value)": 2, "count(value)": 2, "avg(value)": 1, "p95(value)": 1 },
  { "metric.name": "underwriting.referrals", "sum(value)": 3, "count(value)": 6, "avg(value)": 0.5, "p95(value)": 1 },
  { "metric.name": "underwriting.decision", status: "approved", "sum(value)": 3, "count(value)": 3, "avg(value)": 1, "p95(value)": 1 },
  { "metric.name": "underwriting.job", kind: "analyze", outcome: "completed", "sum(value)": 5, "count(value)": 5, "avg(value)": 1, "p95(value)": 1 },
  { "metric.name": "underwriting.job", kind: "analyze", outcome: "retried", "sum(value)": 1, "count(value)": 1, "avg(value)": 1, "p95(value)": 1 },
  { "metric.name": "underwriting.job_duration", kind: "analyze", outcome: "completed", "sum(value)": 10000, "count(value)": 5, "avg(value)": 2000, "p95(value)": 4000 },
  { "metric.name": "underwriting.eval_accuracy", model: "gemini-3.8-flash", "sum(value)": 1.75, "count(value)": 2, "avg(value)": 0.875, "p95(value)": 1 },
  { "metric.name": "underwriting.eval_run", outcome: "passed", model: "gemini-3.8-flash", "sum(value)": 1, "count(value)": 1, "avg(value)": 1, "p95(value)": 1 },
  { "metric.name": "underwriting.eval_run", outcome: "failed", model: "gemini-3.8-flash", "sum(value)": 1, "count(value)": 1, "avg(value)": 1, "p95(value)": 1 },
  { "metric.name": "underwriting.eval_case", fixture: "clear submission", outcome: "pass", "sum(value)": 2, "count(value)": 2, "avg(value)": 1, "p95(value)": 1 },
  { "metric.name": "underwriting.eval_case", fixture: "loss run", outcome: "fail", "sum(value)": 1, "count(value)": 1, "avg(value)": 1, "p95(value)": 1 },
  { "metric.name": "underwriting.eval_case_duration", fixture: "loss run", "sum(value)": 3000, "count(value)": 2, "avg(value)": 1500, "p95(value)": 1800 },
];

test("summarizeMetricRows folds attribute groups into dashboard counters", () => {
  const summary = summarizeMetricRows(rows);
  assert.deepEqual(summary.extraction, { gemini: 7, parser: 2 });
  assert.deepEqual(summary.modelDuration, { avgMs: 1750, p95Ms: 2500, samples: 4, model: "gemini-3.8-flash" });
  assert.deepEqual(summary.analysis, { ready: 4, referred: 0, brokerNeeded: 2, avgReferrals: 0.5 });
  assert.deepEqual(summary.decisions, { approved: 3, declined: 0 });
  assert.deepEqual(summary.jobs, { completed: 5, retried: 1, failed: 0, avgMs: 2000, p95Ms: 4000 });
  assert.equal(summary.evalRuns.runs, 2);
  assert.equal(summary.evalRuns.passedRuns, 1);
  assert.equal(summary.evalRuns.avgAccuracy, 0.875);
  assert.deepEqual(summary.evalRuns.cases, [
    { fixture: "clear submission", pass: 2, fail: 0, avgMs: null },
    { fixture: "loss run", pass: 0, fail: 1, avgMs: 1500 },
  ]);
});

test("summarizeMetricRows tolerates missing and null aggregate columns", () => {
  const summary = summarizeMetricRows([{ "metric.name": "underwriting.model_duration", model: "m", "sum(value)": null, "count(value)": null }]);
  assert.deepEqual(summary.modelDuration, { avgMs: null, p95Ms: null, samples: 0, model: "m" });
  assert.deepEqual(summarizeMetricRows([]).jobs, { completed: 0, retried: 0, failed: 0, avgMs: null, p95Ms: null });
});

test("span, error, and latest-eval rows map to plain numbers", () => {
  assert.deepEqual(summarizeSpanRows([
    { "span.description": "underwriting.checkCase", "count()": 2, "avg(span.duration)": 40.5, "p95(span.duration)": 41 },
    { "span.description": "underwriting.extractCase", "count()": 5, "avg(span.duration)": 162.2, "p95(span.duration)": 300 },
    { "span.description": "", "count()": 9 },
  ]), [
    { name: "underwriting.extractCase", count: 5, avgMs: 162.2, p95Ms: 300 },
    { name: "underwriting.checkCase", count: 2, avgMs: 40.5, p95Ms: 41 },
  ]);
  assert.deepEqual(summarizeErrorRows([{ "count()": 3, "count_unique(issue)": 2 }]), { events: 3, issues: 2 });
  assert.deepEqual(summarizeErrorRows([]), { events: 0, issues: 0 });
  assert.deepEqual(summarizeLatestEval([{ value: 0.75, timestamp: "2026-09-19T21:32:20+00:00", model: null }]), { accuracy: 0.75, at: "2026-09-19T21:32:20+00:00", model: null });
  assert.deepEqual(summarizeLatestEval([]), { accuracy: null, at: null, model: null });
});

test("summarizeEvalSeries reads keyed multi-axis responses and keeps days without runs null", () => {
  const keyed = {
    "avg(value)": { data: [[1789776000, [{ count: 0 }]], [1789862400, [{ count: 0.75 }]], [1789948800, [{ count: 0 }]]] },
    "count(value)": { data: [[1789776000, [{ count: 0 }]], [1789862400, [{ count: 1 }]], [1789948800, [{ count: 2 }]]] },
  };
  assert.deepEqual(summarizeEvalSeries(keyed), [
    { date: "2026-09-19", accuracy: null },
    { date: "2026-09-20", accuracy: 0.75 },
    { date: "2026-09-21", accuracy: 0 },
  ]);
  assert.deepEqual(summarizeEvalSeries({ data: [[1789862400, [{ count: 0.5 }]], [1789948800, [{ count: 0 }]]] }), [
    { date: "2026-09-20", accuracy: 0.5 },
    { date: "2026-09-21", accuracy: null },
  ]);
  assert.deepEqual(summarizeEvalSeries(null), []);
  assert.deepEqual(summarizeEvalSeries({ detail: "error" }), []);
});

test("buildSentryMetrics reports partial failures without dropping the data that loaded", () => {
  const metrics = buildSentryMetrics({
    config, projectId: "42", fetchedAt: new Date("2026-09-19T21:40:00Z"), problems: ["Spans query failed: timed out."],
    metricRows: rows, errorRows: [{ "count()": 1, "count_unique(issue)": 1 }], spanRows: [], latestRows: [{ value: 1, timestamp: "2026-09-19T21:00:00+00:00", model: "gemini-3.8-flash" }], series: null,
  });
  assert.equal(metrics.configured, true);
  assert.equal(metrics.ok, false);
  assert.deepEqual(metrics.problems, ["Spans query failed: timed out."]);
  assert.equal(metrics.errors.events, 1);
  assert.equal(metrics.extraction.gemini, 7);
  assert.equal(metrics.eval.latestAccuracy, 1);
  assert.equal(metrics.eval.latestModel, "gemini-3.8-flash");
  assert.equal(metrics.links?.issues, "https://astra-risk.sentry.io/issues/?project=42&statsPeriod=30d");
  assert.equal(metrics.fetchedAt, "2026-09-19T21:40:00.000Z");
  assert.equal(emptySentryMetrics(false).configured, false);
  assert.equal(emptySentryMetrics(true, ["x"]).problems[0], "x");
});
