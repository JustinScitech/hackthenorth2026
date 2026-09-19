"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowClockwise, ArrowRight, ArrowUpRight, BookOpen, FilePlus, Flask, ListNumbers, SealCheck, Sliders, Tray, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { CaseRecord } from "@/lib/types";
import { Status } from "./status";
import { useCases } from "./use-cases";
import { AgentQuality } from "./agent-quality";

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
  const { cases, loading, hasLoaded, error, refresh } = useCases();
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
        <div className="actions"><button className="icon-button" type="button" onClick={() => void refresh()} aria-label="Refresh" title="Refresh"><ArrowClockwise size={16} /></button></div>
      </div>

      <div className="stat-row">
        <Stat label="Cases" hint="All submissions in this workspace"><span className="stat-value">{loading ? "…" : hasLoaded ? cases.length : "—"}</span></Stat>
        <Stat label="In analysis" hint="Cases the worker is currently extracting or checking"><span className="stat-value">{loading ? "…" : hasLoaded ? inProgress : "—"}</span></Stat>
        <Stat label="Awaiting broker" hint="Cases paused on a durable wait for broker information"><span className="stat-value">{loading ? "…" : hasLoaded ? waiting : "—"}</span></Stat>
        <Stat label="Ready for review" hint="Cases that need an underwriter decision"><span className="stat-value">{loading ? "…" : hasLoaded ? ready : "—"}</span></Stat>
        <Stat label="System status" hint="Whether the case API returned a valid response">
          <span className={`system-status${error ? " degraded" : ""}`}>{error ? <WarningCircle size={16} /> : <SealCheck size={16} weight={loading ? "regular" : "fill"} />}{error ? "Case API unavailable" : loading ? "Checking" : "All systems operational"}</span>
        </Stat>
      </div>

      {error && <div className="alert" role="alert"><WarningCircle size={17} aria-hidden="true" />{error}</div>}

      <div className="tile-grid">
        <Link className="tile" href="/cases/new"><span className="tile-index">01</span><FilePlus size={20} />Create a submission<ArrowUpRight className="external" size={16} /></Link>
        <Link className="tile" href="/cases/new?sample=1"><span className="tile-index">02</span><Flask size={20} />Try the sample case<ArrowUpRight className="external" size={16} /></Link>
        <Link className="tile" href="/triage"><span className="tile-index">03</span><ListNumbers size={20} />Rank Federato submissions<ArrowUpRight className="external" size={16} /></Link>
        <Link className="tile" href="/cases"><span className="tile-index">04</span><Tray size={20} />Browse all cases<ArrowUpRight className="external" size={16} /></Link>
        <Link className="tile" href="/settings"><span className="tile-index">05</span><Sliders size={20} />Appearance and settings<ArrowUpRight className="external" size={16} /></Link>
        <Link className="tile" href="/docs"><span className="tile-index">06</span><BookOpen size={20} />Docs and API reference<ArrowUpRight className="external" size={16} /></Link>
      </div>

      <div className="section-divider" />

      <section aria-labelledby="recent-title">
        <div className="panel-head"><h2 id="recent-title">Recent cases</h2>{cases.length > 0 && <Link className="quiet-button" href="/cases">View all {cases.length}</Link>}</div>
        <div className="card">
          {loading ? <p className="empty-state">Loading cases...</p> : !hasLoaded ? <p className="empty-state">Cases could not be loaded. Use Refresh to try again.</p> : recent.length === 0 ? (
            <div className="panel-empty">
              <span className="empty-icon"><Tray size={22} /></span>
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

      <AgentQuality />

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

      <p className="demo-note">Supplied 2025 carrier appetite. Every final decision requires underwriter review.</p>
    </main>
  );
}
