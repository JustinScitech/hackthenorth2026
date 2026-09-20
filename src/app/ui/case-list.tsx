"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowClockwise, ArrowRight, FilePlus, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { Status } from "./status";
import { useCases } from "./use-cases";
import { rankingExplanation } from "@/federato/presentation";

export function CaseList() {
  const { cases, loading, hasLoaded, error, refresh } = useCases();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const ranked = [...cases].sort((left, right) => {
    if (!left.appetiteResult) return right.appetiteResult ? 1 : 0;
    if (!right.appetiteResult) return -1;
    return right.appetiteResult.score - left.appetiteResult.score || right.appetiteResult.rawScore - left.appetiteResult.rawScore || left.id.localeCompare(right.id, "en", { numeric: true });
  });
  const rows = needle ? ranked.filter((record) => `${record.insuredName} ${record.state ?? ""} ${record.status}`.toLowerCase().includes(needle)) : ranked;

  return (
    <main className="shell">
      <p className="breadcrumb"><Link href="/overview">Commercial property</Link><span className="sep">/</span><span className="current">Cases</span></p>
      <div className="page-title-row">
        <h1 className="page-title">Cases</h1>
        <div className="actions">
          <button className="icon-button" type="button" onClick={() => void refresh()} aria-label="Refresh cases" title="Refresh cases"><ArrowClockwise size={16} /></button>
          <Link className="primary-button" href="/cases/new"><FilePlus size={16} />New submission</Link>
        </div>
      </div>
      {error && <div className="alert" role="alert"><WarningCircle size={17} aria-hidden="true" />{error}</div>}
      <p className="subtle">Local case queue, most recent 1,000 records across all workflow statuses. {rankingExplanation} Unscored and legacy reviews appear last.</p>
      <div className="card">
        <div className="card-header">
          <div className="search-field" style={{ flex: "1 1 320px", maxWidth: 420 }}><MagnifyingGlass size={15} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by insured, state, or status" aria-label="Filter cases" /></div>
          <span className="count">{hasLoaded ? rows.length : "—"}</span>
        </div>
        {loading ? <p className="empty-state">Loading cases...</p> : !hasLoaded ? <p className="empty-state">Cases could not be loaded. Use Refresh to try again.</p> : rows.length === 0 ? <p className="empty-state">{cases.length === 0 ? "No submissions yet. Create a case to begin." : "No cases match that filter."}</p> : (
          <div className="case-list">
            {rows.map((record) => (
              <Link className="case-row" href={`/cases/${record.id}`} key={record.id}>
                <div className="case-main"><strong>{record.insuredName}</strong><span>{record.state ?? "State pending"} · {record.tiv === null ? "TIV pending" : `$${record.tiv.toLocaleString()} TIV`}</span><span>{record.appetiteResult ? `Match ${record.appetiteResult.rawScore}/100 · Priority ${record.appetiteResult.score}/100` : "Not scored against carrier appetite"}</span></div>
                <Status value={record.status} />
                <time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleDateString()}</time>
                <ArrowRight className="row-arrow" size={16} aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
