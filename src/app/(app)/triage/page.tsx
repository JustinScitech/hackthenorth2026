"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Download, Info, ListOrdered, Printer, TriangleAlert } from "lucide-react";
import type { TriageReport } from "@/federato/triage";
import { buildSummaryMarkdown, rankingExplanation, resourceLabels, summarizeSubmission } from "@/federato/presentation";

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
  function downloadSummary() {
    if (!report) return;
    const blob = new Blob([buildSummaryMarkdown(report)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `underwriting-summary-${new Date(report.generatedAt).toISOString().slice(0, 10)}.md`; link.click(); URL.revokeObjectURL(url);
  }
  const rows = report ? showAll ? report.ranked : report.topSubmissions : [];
  const labels = report ? resourceLabels(report.resource) : null;
  return <main className="shell">
    <p className="breadcrumb"><Link href="/overview">Commercial property</Link><span className="sep">/</span><span className="current">Federato triage</span></p>
    <div className="page-heading triage-heading">
      <div><p className="eyebrow">Federato challenge</p><h1>{labels ? `${labels.singular} priorities` : "Underwriting priorities"}</h1><p className="subtle">Rank the API queue against the supplied 2025 commercial property appetite.</p></div>
      <button className="primary-button" onClick={run} disabled={loading}><ListOrdered size={16} />{loading ? "Discovering and scoring…" : "Rank live records"}</button>
    </div>
    <p className="lede">Scores prioritize human review. Matching guidelines does not approve or bind coverage.</p>
    <div aria-live="polite">
      {loading && <div className="notice"><Info size={17} aria-hidden="true" />Discovering available fields and reading the queue. Large queues may take a few minutes.</div>}
      {error && <div role="alert" className="alert"><CircleAlert size={17} aria-hidden="true" />{error}</div>}
    </div>
    {!report && !loading && !error && <div className="card"><p className="empty-state">Run triage to discover the resource and see ranked records, per-factor scores, and the reasoning behind each query.</p></div>}
    {report && <>
      <p className="triage-meta"><span>{report.evaluated} of {report.total} <code>{report.resource}</code> records evaluated</span><span aria-hidden="true">·</span><time dateTime={report.generatedAt}>{new Date(report.generatedAt).toLocaleString()}</time></p>
      {report.resource === "Policy" && <p className="subtle">Scope: Policy records across lifecycle statuses, not the standalone Submission queue.</p>}
      {report.resource === "Submission" && <p className="subtle">Scope: actual submissions across all lifecycle statuses, including unmatched submissions. Policy evidence is used only for verified unique links.</p>}
      {report.enrichmentComplete === false && <p className="notice">Policy lookup was partial. No policy enrichment was used because link uniqueness could not be verified.</p>}
      {report.ranked.length > 0 && report.ranked.every((item) => item.criteria.some((criterion) => criterion.status === "outside")) && <div className="notice"><TriangleAlert size={17} aria-hidden="true" />All evaluated records have at least one appetite exception. These are the highest-ranked records in this scope, not fully in-appetite matches.</div>}
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
      <div className="section-heading"><div><h2>{showAll ? `All evaluated ${labels?.plural}` : `Top ${report.top} ${labels?.plural}`}</h2><p className="subtle">Start with the recommended action, then open the evidence when you need the detail.</p></div><div className="actions"><button className="quiet-button" onClick={downloadSummary}><Download size={15} />Download summary</button><button className="quiet-button" onClick={() => window.print()}><Printer size={15} />Print / save PDF</button><button className="quiet-button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show top results" : "Show all results"}</button></div></div>
      <p className="subtle">{rankingExplanation}</p>
      {!rows.length && <div className="card"><p className="empty-state">The API returned an empty queue.</p></div>}
      <div className="triage-list">
        {rows.map((item, index) => { const summary = summarizeSubmission(item); const Icon = summary.status === "positive" ? CheckCircle2 : summary.status === "refer" ? TriangleAlert : CircleAlert; return <article key={item.id} className="triage-card card">
          <div className="card-header"><h2><span className="rank" aria-label={`Rank ${index + 1}`}>{index + 1}</span>{item.account}</h2><div><span className="subtle">Match score </span><span className="score">{item.rawScore}<small>/100</small></span><p className="subtle">Priority score: {item.score}/100</p></div></div>
          <p className="subtle">Lifecycle status: {item.lifecycleStatus}. {item.evidenceNote}</p>
          <div className="card-body"><div className={`decision-banner decision-${summary.status}`}><Icon size={18} aria-hidden="true" /><div><strong>{summary.title}</strong><span>{summary.plainExplanation}</span></div></div><p className="next-action"><strong>Next step:</strong> {summary.action}</p><div className="plain-facts">{summary.strengths.length > 0 && <div><strong>What supports this:</strong> {summary.strengths.join(", ")}</div>}{summary.questions.length > 0 && <div><strong>What to check:</strong> {summary.questions.join(", ")}</div>}</div><details className="technical-detail"><summary>Show the detailed reasoning</summary><p className="subtle" style={{ marginBottom: 10 }}><span className="annotation">{labels?.singular} {item.id}</span> {item.recommendation}</p><p>{item.explanation}</p></details></div>
          <details><summary>Appetite breakdown and data sources</summary><div className="triage-table-wrap"><table className="triage-table"><thead><tr><th>Factor</th><th>Result</th><th>Points</th><th>Evidence and rule</th></tr></thead><tbody>{item.criteria.map((criterion) => <tr key={criterion.factor}><th scope="row">{criterion.factor}</th><td>{criterion.status}</td><td>{criterion.points}/{criterion.maximum}</td><td>{criterion.detail}<small>Source: {criterion.source}</small></td></tr>)}</tbody></table></div></details>
        </article>; })}
      </div>
    </>}
  </main>;
}
