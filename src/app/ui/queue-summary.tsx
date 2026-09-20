"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ListNumbers } from "@phosphor-icons/react/dist/ssr";
import { classify, dispositionOrder } from "@/federato/disposition";
import type { StoredTriageReport } from "@/federato/reports";

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : new Date(iso).toLocaleDateString();
}

/** The last ranked Federato queue, counted by disposition, so the overview opens on what needs attention. */
export function QueueSummary() {
  const [report, setReport] = useState<StoredTriageReport | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/triage", { cache: "no-store" }).then((response) => response.json()).then((data: unknown) => {
      setReport(data && typeof data === "object" && "report" in data && data.report ? data.report as StoredTriageReport : null);
    }).catch(() => setReport(null));
  }, []);
  const property = report ? report.ranked.filter((item) => item.criteria.find((criterion) => criterion.concept === "line")?.status !== "outside") : [];
  const count = (disposition: string) => property.filter((item) => classify(item).disposition === disposition).length;
  return (
    <section aria-labelledby="queue-title">
      <div className="panel-head"><div><h2 id="queue-title">Federato queue</h2><p className="subtle">Live submissions read against the 2025 appetite</p></div><Link className="quiet-button" href="/triage">Open the queue <ArrowRight size={14} aria-hidden="true" /></Link></div>
      {report === undefined && <p className="subtle">Loading the last ranked queue…</p>}
      {report === null && (
        <div className="card"><div className="panel-empty">
          <span className="empty-icon"><ListNumbers size={22} /></span>
          <strong>The live queue has yet to be ranked.</strong>
          <p>Rank it once and every submission gets a disposition, a one-line reason, and a next step.</p>
          <Link className="primary-button accent" href="/triage">Rank the live queue</Link>
        </div></div>
      )}
      {report && <>
        <div className="stat-row queue-stat-row">
          <div className="stat"><span className="label-mono">Property submissions</span><span className="stat-value">{property.length}</span></div>
          {dispositionOrder.map((disposition) => <div className="stat" key={disposition}><span className="label-mono">{disposition}</span><span className="stat-value">{count(disposition)}</span></div>)}
        </div>
        <p className="queue-panel-note"><span>{report.evaluated} of {report.total} submissions across every line · ranked {ago(report.generatedAt)}</span><span>Each row that needs information names the answer and where it comes from.</span></p>
      </>}
    </section>
  );
}
