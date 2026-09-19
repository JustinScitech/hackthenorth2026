"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { AgentMetrics } from "@/lib/agent-metrics";

type DisplayMetrics = AgentMetrics & { evalTimeLabel: string | null };

function Metric({ label, hint, value }: { label: string; hint: string; value: string | number }) {
  return <div className="stat"><span className="label-mono">{label}<span className="hint" title={hint} aria-label={hint}>?</span></span><span className="stat-value">{value}</span></div>;
}

export function AgentQuality() {
  const [metrics, setMetrics] = useState<DisplayMetrics | null>(null);
  const [error, setError] = useState(false);
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
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return <section aria-labelledby="agent-quality-title">
    <div className="panel-head">
      <div><h2 id="agent-quality-title">Agent quality</h2><p className="subtle">Past 30 days · local case and audit records{metrics?.sentryExportEnabled ? " · Sentry export active" : ""}</p></div>
      <button className="icon-button" type="button" onClick={() => void refresh()} aria-label="Refresh agent metrics" title="Refresh agent metrics"><ArrowClockwise size={16} /></button>
    </div>
    {error && <div className="alert" role="alert"><WarningCircle size={17} aria-hidden="true" />Agent metrics are unavailable.</div>}
    <div className="stat-row">
      <Metric label="Submissions" hint="Cases created in the past 30 days" value={metrics?.submissions ?? "…"} />
      <Metric label="Model extractions" hint="Extraction runs completed by a model" value={metrics?.modelExtractions ?? "…"} />
      <Metric label="Parser fallbacks" hint="Extraction runs completed without a model result" value={metrics?.parserExtractions ?? "…"} />
      <Metric label="Analysis time" hint="Average time from case creation to first guideline check" value={metrics?.averageAnalysisSeconds === null ? "—" : metrics ? `${metrics.averageAnalysisSeconds}s` : "…"} />
      <Metric label="Latest eval" hint="Most recent live Gemini evaluation" value={metrics?.latestEval ? `${metrics.latestEval.passed}/${metrics.latestEval.total}` : metrics ? "Not run" : "…"} />
    </div>
    {metrics?.latestEval && <p className="subtle">Last eval {metrics.evalTimeLabel} · {metrics.latestEval.model ?? "No model result"}</p>}
  </section>;
}
