"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, CircleAlert, FilePlus2, Inbox, ListOrdered, RotateCw, Settings, Sparkles } from "lucide-react";
import type { CaseRecord } from "@/lib/types";
import { Status } from "./status";
import { useCases } from "./use-cases";

const RANGES = [7, 14, 30] as const;

function Stat({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return <div className="stat"><span className="label-mono">{label}<span className="hint" title={hint} aria-label={hint}>?</span></span>{children}</div>;
}

function dayKey(date: Date) { return date.toISOString().slice(0, 10); }

function CasesChart({ cases, days }: { cases: CaseRecord[]; days: number }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(today); date.setDate(today.getDate() - (days - 1 - index));
    return { key: dayKey(date), label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), count: 0 };
  });
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const record of cases) {
    const bucket = byKey.get(dayKey(new Date(record.createdAt)));
    if (bucket) bucket.count += 1;
  }
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const labelEvery = days > 14 ? 5 : days > 7 ? 2 : 1;
  return (
    <div className="chart" role="img" aria-label={`Cases created per day, ${total} in the past ${days} days`}>
      <div className="bars">
        {buckets.map((bucket) => (
          <button key={bucket.key} className="bar" type="button" tabIndex={0} aria-label={`${bucket.label}: ${bucket.count} case${bucket.count === 1 ? "" : "s"}`}>
            <span className="bar-tip">{bucket.count} case{bucket.count === 1 ? "" : "s"}<small>{bucket.label}</small></span>
            <span className="bar-fill" style={{ height: `${Math.max(1, (bucket.count / max) * 100)}%`, opacity: bucket.count === 0 ? 0.25 : undefined }} />
          </button>
        ))}
      </div>
      <div className="bar-axis" aria-hidden="true">{buckets.map((bucket, index) => <span key={bucket.key}>{index % labelEvery === 0 || index === buckets.length - 1 ? bucket.label : ""}</span>)}</div>
      {total === 0 && <div className="chart-empty"><span>No data for the selected time range.</span></div>}
      <details className="chart-table"><summary>View as table</summary><table><thead><tr><th>Day</th><th>Cases</th></tr></thead><tbody>{buckets.map((bucket) => <tr key={bucket.key}><td>{bucket.label}</td><td>{bucket.count}</td></tr>)}</tbody></table></details>
    </div>
  );
}

export function Overview() {
  const { cases, loading, error, refresh } = useCases();
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const waiting = cases.filter((record) => record.status === "waiting_for_broker").length;
  const ready = cases.filter((record) => record.status === "review_ready").length;
  const inProgress = cases.filter((record) => ["received", "extracting", "checking"].includes(record.status)).length;
  const recent = cases.slice(0, 5);

  return (
    <main className="shell">
      <p className="breadcrumb"><Link href="/overview">Commercial property</Link><span className="sep">/</span><span className="current">Overview</span></p>
      <div className="page-title-row">
        <h1 className="page-title">Overview</h1>
        <div className="actions"><button className="icon-button" type="button" onClick={() => void refresh()} aria-label="Refresh" title="Refresh"><RotateCw size={16} /></button></div>
      </div>

      <div className="stat-row">
        <Stat label="Cases" hint="All submissions in this workspace"><span className="stat-value">{loading ? "…" : cases.length}</span></Stat>
        <Stat label="In analysis" hint="Cases the worker is currently extracting or checking"><span className="stat-value">{loading ? "…" : inProgress}</span></Stat>
        <Stat label="Awaiting broker" hint="Cases paused on a durable wait for broker information"><span className="stat-value">{loading ? "…" : waiting}</span></Stat>
        <Stat label="Ready for review" hint="Cases that need an underwriter decision"><span className="stat-value">{loading ? "…" : ready}</span></Stat>
        <Stat label="System status" hint="Whether the case API is reachable from this browser">
          <span className={`system-status${error ? " degraded" : ""}`}>{error ? "API unreachable" : loading ? "Checking" : "All systems operational"}</span>
        </Stat>
      </div>

      {error && <div className="alert" role="alert"><CircleAlert size={17} aria-hidden="true" />{error}</div>}

      <div className="tile-grid">
        <Link className="tile" href="/cases/new"><FilePlus2 size={20} />Create a submission</Link>
        <Link className="tile" href="/cases/new?sample=1"><Sparkles size={20} />Try the sample case</Link>
        <Link className="tile" href="/triage"><ListOrdered size={20} />Rank Federato submissions</Link>
        <Link className="tile" href="/cases"><Inbox size={20} />Browse all cases</Link>
        <Link className="tile" href="/settings"><Settings size={20} />Appearance and settings</Link>
        <Link className="tile" href="/docs"><BookOpen size={20} />Go to docs and API reference</Link>
      </div>

      <div className="section-divider" />

      <section aria-labelledby="recent-title">
        <div className="panel-head"><h2 id="recent-title">Recent cases</h2>{cases.length > 0 && <Link className="quiet-button" href="/cases">View all {cases.length}</Link>}</div>
        <div className="card">
          {loading ? <p className="empty-state">Loading cases...</p> : recent.length === 0 ? (
            <div className="panel-empty">
              <span className="empty-icon"><Inbox size={20} /></span>
              <strong>No cases in this workspace yet.</strong>
              <p>Start a submission and the agent will extract facts, check guidelines, and pause for the broker when needed.</p>
              <Link className="primary-button accent" href="/cases/new">Create your first submission</Link>
            </div>
          ) : (
            <div className="case-list">
              {recent.map((record) => (
                <Link className="case-row" href={`/cases/${record.id}`} key={record.id}>
                  <div className="case-main"><strong>{record.insuredName}</strong><span>{record.state} · ${record.tiv.toLocaleString()} TIV</span></div>
                  <Status value={record.status} />
                  <time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleDateString()}</time>
                  <ArrowRight className="row-arrow" size={16} aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="section-divider" />

      <section aria-labelledby="insights-title">
        <div className="panel-head">
          <h2 id="insights-title">Insights</h2>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><span className="subtle">Range</span><select value={days} onChange={(event) => setDays(Number(event.target.value) as (typeof RANGES)[number])} aria-label="Insights time range">{RANGES.map((range) => <option key={range} value={range}>Past {range} days</option>)}</select></label>
        </div>
        <div className="card chart-card">
          <div className="chart-head"><span className="label-mono">Cases created<span className="hint" title="New submissions per day, by creation date" aria-label="New submissions per day, by creation date">?</span></span></div>
          <CasesChart cases={cases} days={days} />
        </div>
      </section>

      <p className="demo-note">Fictional guideline rules for demonstration only. Every final decision requires underwriter review.</p>
    </main>
  );
}
