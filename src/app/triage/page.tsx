"use client";

import { useState } from "react";
import Link from "next/link";
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
      <p>{report.evaluated} of {report.total} {report.resource} records evaluated · {new Date(report.generatedAt).toLocaleString()}</p>
      {report.truncated && <p className="alert">Partial ranking: the 1,000-record limit was reached. Results cover only the evaluated records.</p>}
      <details className="triage-plan"><summary>Query reasoning and scoring method</summary><p>{report.guidelineVersion}</p><p>Eight weighted criteria total 100 points. Target matches earn full points; acceptable matches earn 80%; unknowns and exceptions earn zero. Exceptions cap the total at 49; incomplete required data caps it at 69. Weights and caps are application choices, not carrier-prescribed scores.</p><ul>{report.reasoning.map((reason) => <li key={reason}>{reason}</li>)}</ul>{report.trace.map((step, index) => <details key={index}><summary>Query {index + 1}: {step.returned} records</summary><p>{step.reason}</p><pre>{JSON.stringify(step.query, null, 2)}</pre></details>)}</details>
      <div className="section-heading"><h2>{showAll ? "All evaluated submissions" : `Top ${report.top} submissions`}</h2><button className="quiet-button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show top results" : "Show all results"}</button></div>
      {!rows.length && <p className="empty-state">The API returned an empty queue.</p>}
      {rows.map((item, index) => <article key={item.id} className="triage-card"><div className="section-heading"><h2>#{index + 1} · {item.account}</h2><strong>{item.score}/100</strong></div><p className="subtle">Submission {item.id} · {item.recommendation}</p><p>{item.explanation}</p><details><summary>Appetite breakdown and data sources</summary><div className="triage-table-wrap"><table className="triage-table"><thead><tr><th>Factor</th><th>Result</th><th>Points</th><th>Evidence and rule</th></tr></thead><tbody>{item.criteria.map((criterion) => <tr key={criterion.factor}><th scope="row">{criterion.factor}</th><td>{criterion.status}</td><td>{criterion.points}/{criterion.maximum}</td><td>{criterion.detail}<br /><small>Source: {criterion.source}</small></td></tr>)}</tbody></table></div></details></article>)}
    </>}
  </main>;
}
