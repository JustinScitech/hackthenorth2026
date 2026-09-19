"use client";

import { useState } from "react";
import { CircleAlert, Info, ListOrdered } from "lucide-react";
import type { TriageReport } from "@/federato/triage";

type Report = Omit<TriageReport, "schema">;
export default function TriagePage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  async function run() {
    setLoading(true); setError(""); setReport(null);
    try {
      const response = await fetch("/api/triage", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to rank the queue.");
      setReport(data); setShowAll(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to rank the queue."); }
    finally { setLoading(false); }
  }
  const rows = report ? showAll ? report.ranked : report.topSubmissions : [];
  return <main className="shell">
    <Link href="/" className="back-link">← Case review demo</Link>
    <div className="page-heading triage-heading"><div><p className="eyebrow">Federato challenge</p><h1>Submission priorities</h1><p className="subtle">Rank the API queue against the supplied 2025 commercial property appetite.</p></div><button className="primary-button" onClick={run} disabled={loading}>{loading ? "Discovering and scoring…" : "Rank live submissions"}</button></div>
    <p className="subtle">Scores prioritize human review. Matching guidelines does not approve or bind coverage.</p>
    <div aria-live="polite">{loading && <p>Discovering available fields and reading the queue. Large queues may take a few minutes.</p>}{error && <p role="alert" className="alert">{error}</p>}</div>
    {!report && !loading && !error && <p className="empty-state">Run triage to see ranked submissions, per-factor scores, and the reasoning behind each query.</p>}
    {report && <>
      <p className="triage-meta"><span>{report.evaluated} of {report.total} <code>{report.resource}</code> records evaluated</span><span aria-hidden="true">·</span><time dateTime={report.generatedAt}>{new Date(report.generatedAt).toLocaleString()}</time></p>
      {report.truncated && <div className="notice"><Info size={17} aria-hidden="true" />Partial ranking: the 1,000-record limit was reached. Results cover only the evaluated records.</div>}
      <details className="triage-plan popup">
        <summary>Query reasoning and scoring method</summary>
        <div className="triage-plan-body">
          <p><span className="annotation">{report.guidelineVersion}</span></p>
          <p>Eight weighted criteria total 100 points. Target matches earn full points; acceptable matches earn 80%; unknowns and exceptions earn zero. Exceptions cap the total at 49; incomplete required data caps it at 69. Weights and caps are application choices, not carrier-prescribed scores.</p>
          <ul>{report.reasoning.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          {report.trace.map((step, index) => <details key={index}><summary>Query {index + 1}: {step.returned} records</summary><p>{step.reason}</p><pre>{JSON.stringify(step.query, null, 2)}</pre></details>)}
        </div>
      </details>
      <div className="section-heading"><h2>{showAll ? "All evaluated submissions" : `Top ${report.top} submissions`}</h2><button className="quiet-button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show top results" : "Show all results"}</button></div>
      {!rows.length && <div className="card"><p className="empty-state">The API returned an empty queue.</p></div>}
      <div className="triage-list">
        {rows.map((item, index) => <article key={item.id} className="triage-card card">
          <div className="card-header"><h2><span className="rank" aria-label={`Rank ${index + 1}`}>{index + 1}</span>{item.account}</h2><span className="score">{item.score}<small>/100</small></span></div>
          <div className="card-body"><p className="subtle" style={{ marginBottom: 10 }}><span className="annotation">submission {item.id}</span> {item.recommendation}</p><p>{item.explanation}</p></div>
          <details><summary>Appetite breakdown and data sources</summary><div className="triage-table-wrap"><table className="triage-table"><thead><tr><th>Factor</th><th>Result</th><th>Points</th><th>Evidence and rule</th></tr></thead><tbody>{item.criteria.map((criterion) => <tr key={criterion.factor}><th scope="row">{criterion.factor}</th><td>{criterion.status}</td><td>{criterion.points}/{criterion.maximum}</td><td>{criterion.detail}<small>Source: {criterion.source}</small></td></tr>)}</tbody></table></div></details>
        </article>)}
      </div>
    </>}
  </main>;
}
