"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, ExternalLink, RotateCw } from "lucide-react";
import type { AgentMetrics } from "@/lib/agent-metrics";
import type { EvalPoint, SentryMetrics } from "@/lib/sentry-query";

type DisplayMetrics = AgentMetrics & { evalTimeLabel: string | null };

function percent(value: number | null) { return value === null ? "—" : `${Math.round(value * 100)}%`; }
function duration(value: number | null) { return value === null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`; }
function shortName(name: string) { return name.replace(/^underwriting\./, ""); }

function Metric({ label, hint, value, detail }: { label: string; hint: string; value: string | number; detail?: string }) {
  return <div className="stat"><span className="label-mono">{label}<span className="hint" title={hint} aria-label={hint}>?</span></span><span className="stat-value">{value}</span>{detail && <span className="stat-detail">{detail}</span>}</div>;
}

function EvalTrend({ series }: { series: EvalPoint[] }) {
  const points = series.map((point) => ({ ...point, label: new Date(`${point.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }));
  const runs = points.filter((point) => point.accuracy !== null).length;
  const labelEvery = points.length > 14 ? 5 : points.length > 7 ? 2 : 1;
  return (
    <div className="chart" role="img" aria-label={`Eval accuracy per day, ${runs} day${runs === 1 ? "" : "s"} with eval runs in the past ${points.length} days`}>
      <div className="bars">
        {points.map((point) => (
          <button key={point.date} className="bar" type="button" tabIndex={0} aria-label={`${point.label}: ${point.accuracy === null ? "no eval run" : `${percent(point.accuracy)} accuracy`}`}>
            <span className="bar-tip">{point.accuracy === null ? "No eval run" : `${percent(point.accuracy)} accuracy`}<small>{point.label}</small></span>
            <span className="bar-fill" style={{ height: point.accuracy === null ? "2px" : `${Math.max(2, point.accuracy * 100)}%`, opacity: point.accuracy === null ? 0.25 : undefined }} />
          </button>
        ))}
      </div>
      <div className="bar-axis" aria-hidden="true">{points.map((point, index) => <span key={point.date}>{index % labelEvery === 0 || index === points.length - 1 ? point.label : ""}</span>)}</div>
      {runs === 0 && <div className="chart-empty"><span>No eval runs reported to Sentry yet. Run <code>npm run eval:agent</code>.</span></div>}
      <details className="chart-table"><summary>View as table</summary><table><thead><tr><th>Day</th><th>Accuracy</th></tr></thead><tbody>{points.map((point) => <tr key={point.date}><td>{point.label}</td><td>{point.accuracy === null ? "—" : percent(point.accuracy)}</td></tr>)}</tbody></table></details>
    </div>
  );
}

function SentryPanel({ sentry, error, onRefresh }: { sentry: SentryMetrics | null; error: boolean; onRefresh: () => void }) {
  const updated = sentry?.fetchedAt ? new Date(sentry.fetchedAt).toLocaleTimeString() : null;
  return (
    <div className="telemetry">
      <div className="panel-head telemetry-head">
        <div>
          <h3 id="sentry-telemetry-title">Sentry telemetry</h3>
          <p className="subtle">Past {sentry?.periodDays ?? 30} days · errors, agent spans, and metrics from the worker, eval runs, and web app{sentry?.org ? ` · ${sentry.org}/${sentry.project}` : ""}</p>
        </div>
        <div className="actions">
          {sentry?.links && <a className="quiet-button" href={sentry.links.issues} target="_blank" rel="noreferrer">Open in Sentry <ExternalLink size={14} aria-hidden="true" /></a>}
          <button className="icon-button" type="button" onClick={onRefresh} aria-label="Refresh Sentry telemetry" title="Refresh Sentry telemetry"><RotateCw size={16} /></button>
        </div>
      </div>
      {error && <div className="alert" role="alert"><CircleAlert size={17} aria-hidden="true" />Sentry telemetry is unavailable.</div>}
      {sentry && !sentry.configured && (
        <div className="card telemetry-note">Sentry telemetry is off for this server. Set <code>SENTRY_AUTH_TOKEN</code> (with <code>SENTRY_ORG</code> and <code>SENTRY_PROJECT</code>) to read errors, agent spans, and eval metrics here, and <code>SENTRY_DSN</code> so the worker reports them.</div>
      )}
      {sentry?.configured && (
        <>
          {sentry.problems.length > 0 && <div className="alert" role="alert"><CircleAlert size={17} aria-hidden="true" />{sentry.problems.join(" ")}</div>}
          <div className="stat-row">
            <Metric label="Errors" hint="Error and warning events reported to Sentry, with the number of distinct issues" value={sentry.errors.events} detail={`${sentry.errors.issues} issue${sentry.errors.issues === 1 ? "" : "s"}`} />
            <Metric label="Extractions" hint="underwriting.extraction counter by source" value={sentry.extraction.gemini + sentry.extraction.parser} detail={`${sentry.extraction.gemini} Gemini · ${sentry.extraction.parser} parser`} />
            <Metric label="Model latency" hint="underwriting.model_duration: average and p95 of completed Gemini calls" value={duration(sentry.modelDuration.avgMs)} detail={sentry.modelDuration.samples ? `p95 ${duration(sentry.modelDuration.p95Ms)} · ${sentry.modelDuration.model ?? "unknown model"}` : "No completed model calls"} />
            <Metric label="Analysis outcomes" hint="underwriting.analysis counter by outcome, with the average referral count" value={sentry.analysis.ready + sentry.analysis.referred + sentry.analysis.brokerNeeded} detail={`${sentry.analysis.ready} ready · ${sentry.analysis.referred} referred · ${sentry.analysis.brokerNeeded} broker`} />
            <Metric label="Decisions" hint="underwriting.decision counter by status" value={sentry.decisions.approved + sentry.decisions.declined} detail={`${sentry.decisions.approved} approved · ${sentry.decisions.declined} declined`} />
            <Metric label="Jobs" hint="underwriting.job counter by outcome, with the average job duration" value={sentry.jobs.completed + sentry.jobs.retried + sentry.jobs.failed} detail={`${sentry.jobs.completed} done · ${sentry.jobs.retried} retried · ${sentry.jobs.failed} failed · avg ${duration(sentry.jobs.avgMs)}`} />
            <Metric label="Eval accuracy" hint="Latest underwriting.eval_accuracy gauge from npm run eval:agent" value={percent(sentry.eval.latestAccuracy)} detail={sentry.eval.runs ? `${sentry.eval.runs} run${sentry.eval.runs === 1 ? "" : "s"} · ${sentry.eval.passedRuns} fully passed · avg ${percent(sentry.eval.avgAccuracy)}` : "No eval runs reported"} />
          </div>
          <div className="telemetry-grid">
            <div className="card chart-card">
              <div className="chart-head"><span className="label-mono">Eval accuracy by day<span className="hint" title="Average underwriting.eval_accuracy per day; empty days had no eval run" aria-label="Average underwriting.eval_accuracy per day; empty days had no eval run">?</span></span></div>
              <EvalTrend series={sentry.eval.series} />
            </div>
            <div className="card telemetry-card">
              <div className="chart-head"><span className="label-mono">Agent activity spans<span className="hint" title="Traced worker activities, jobs, and eval runs by count and duration" aria-label="Traced worker activities, jobs, and eval runs by count and duration">?</span></span>{sentry.links && <a className="quiet-button" href={sentry.links.traces} target="_blank" rel="noreferrer">Traces</a>}</div>
              {sentry.activities.length === 0 ? <p className="metric-empty">No agent spans yet. Spans appear once the worker processes a case with <code>SENTRY_DSN</code> set.</p> : (
                <table className="metric-table"><thead><tr><th>Span</th><th>Runs</th><th>Avg</th><th>p95</th></tr></thead><tbody>
                  {sentry.activities.map((activity) => <tr key={activity.name}><td>{shortName(activity.name)}</td><td>{activity.count}</td><td>{duration(activity.avgMs)}</td><td>{duration(activity.p95Ms)}</td></tr>)}
                </tbody></table>
              )}
              {sentry.eval.cases.length > 0 && (
                <table className="metric-table" aria-label="Eval fixtures"><thead><tr><th>Eval fixture</th><th>Pass</th><th>Fail</th><th>Avg</th></tr></thead><tbody>
                  {sentry.eval.cases.map((fixture) => <tr key={fixture.fixture}><td>{fixture.fixture}</td><td>{fixture.pass}</td><td>{fixture.fail}</td><td>{duration(fixture.avgMs)}</td></tr>)}
                </tbody></table>
              )}
            </div>
          </div>
          <p className="subtle">{updated ? `Updated ${updated}` : "Updating"} · Sentry data is cached for one minute · the auth token stays on the server{sentry.eval.latestAt ? ` · last eval ${new Date(sentry.eval.latestAt).toLocaleString()}` : ""}</p>
        </>
      )}
      {!sentry && !error && <p className="subtle">Loading Sentry telemetry…</p>}
    </div>
  );
}

export function AgentQuality() {
  const [metrics, setMetrics] = useState<DisplayMetrics | null>(null);
  const [error, setError] = useState(false);
  const [sentry, setSentry] = useState<SentryMetrics | null>(null);
  const [sentryError, setSentryError] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/metrics", { cache: "no-store" });
      if (!response.ok) throw new Error("Metrics unavailable");
      const result = await response.json() as AgentMetrics;
      setMetrics({ ...result, evalTimeLabel: result.latestEval ? new Date(result.latestEval.createdAt).toLocaleString() : null });
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  const refreshSentry = useCallback(async () => {
    try {
      const response = await fetch("/api/metrics/sentry", { cache: "no-store" });
      if (!response.ok) throw new Error("Sentry metrics unavailable");
      setSentry(await response.json() as SentryMetrics);
      setSentryError(false);
    } catch {
      setSentryError(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
    void refreshSentry();
    const timer = setInterval(() => void refresh(), 15_000);
    const sentryTimer = setInterval(() => void refreshSentry(), 60_000);
    return () => { clearInterval(timer); clearInterval(sentryTimer); };
  }, [refresh, refreshSentry]);

  return <section aria-labelledby="agent-quality-title">
    <div className="panel-head">
      <div><h2 id="agent-quality-title">Agent quality</h2><p className="subtle">Past 30 days · local case and audit records{metrics?.sentryExportEnabled ? " · Sentry export active" : ""}</p></div>
      <button className="icon-button" type="button" onClick={() => void refresh()} aria-label="Refresh agent metrics" title="Refresh agent metrics"><RotateCw size={16} /></button>
    </div>
    {error && <div className="alert" role="alert"><CircleAlert size={17} aria-hidden="true" />Agent metrics are unavailable.</div>}
    <div className="stat-row">
      <Metric label="Submissions" hint="Cases created in the past 30 days" value={metrics?.submissions ?? "…"} />
      <Metric label="Model extractions" hint="Extraction runs completed by a model" value={metrics?.modelExtractions ?? "…"} />
      <Metric label="Parser fallbacks" hint="Extraction runs completed without a model result" value={metrics?.parserExtractions ?? "…"} />
      <Metric label="Analysis time" hint="Average time from case creation to first guideline check" value={metrics?.averageAnalysisSeconds === null ? "—" : metrics ? `${metrics.averageAnalysisSeconds}s` : "…"} />
      <Metric label="Latest eval" hint="Most recent live Gemini evaluation" value={metrics?.latestEval ? `${metrics.latestEval.passed}/${metrics.latestEval.total}` : metrics ? "Not run" : "…"} />
    </div>
    {metrics?.latestEval && <p className="subtle">Last eval {metrics.evalTimeLabel} · {metrics.latestEval.model ?? "No model result"}</p>}
    <SentryPanel sentry={sentry} error={sentryError} onRefresh={() => void refreshSentry()} />
  </section>;
}
