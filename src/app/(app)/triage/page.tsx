"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle, DownloadSimple, Info, ListNumbers, Printer, Warning, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { TriageReport } from "@/federato/triage";
import { rankingExplanation, resourceLabels, summarizeSubmission } from "@/federato/presentation";
import { buildReviewPlan, summarizeQueue } from "@/federato/review-plan";
import { PdfTriage } from "@/app/ui/pdf-triage";
import { AppetiteCriteriaTable } from "@/app/ui/appetite-criteria-table";

type Report = Omit<TriageReport, "schema">;
export default function TriagePage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [stopped, setStopped] = useState(false);
  const runController = useRef<AbortController | null>(null);
  async function run() {
    const controller = new AbortController();
    runController.current = controller;
    setLoading(true); setError(""); setExportError(""); setReport(null); setStopped(false);
    try {
      const response = await fetch("/api/triage", { method: "POST", signal: controller.signal });
      const data = await response.json();
      controller.signal.throwIfAborted();
      if (!response.ok) throw new Error(data.error ?? "Unable to rank the queue.");
      setReport(data); setShowAll(false);
    } catch (err) { if (controller.signal.aborted) setStopped(true); else setError(err instanceof Error ? err.message : "Unable to rank the queue."); }
    finally { if (runController.current === controller) runController.current = null; setLoading(false); }
  }
  async function downloadSlides() {
    if (!report || exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const { downloadTriageSlides } = await import("@/federato/slides");
      await downloadTriageSlides(report, showAll);
    } catch {
      setExportError("Could not create the slide deck. Please try again.");
    } finally {
      setExporting(false);
    }
  }
  const rows = report ? showAll ? report.ranked : report.topSubmissions : [];
  const labels = report ? resourceLabels(report.resource) : null;
  const queue = report ? summarizeQueue(report.ranked) : null;
  return <main className="shell triage-page">
    <p className="breadcrumb"><Link href="/overview">Commercial property</Link><span className="sep">/</span><span className="current">Federato triage</span></p>
    <div className="page-heading triage-heading">
      <div><p className="eyebrow">Federato challenge</p><h1>{labels ? `${labels.singular} priorities` : "Underwriting priorities"}</h1><p className="subtle">Rank the API queue against the supplied 2025 commercial property appetite.</p></div>
      <div className="actions"><button className="primary-button" onClick={run} disabled={loading || exporting}><ListNumbers size={16} />{loading ? "Discovering and scoring…" : "Rank live records"}</button>{loading && <button className="quiet-button" type="button" onClick={() => runController.current?.abort()}>Stop ranking</button>}</div>
    </div>
    <p className="lede">Scores order the queue for human review. Approval and binding stay with the underwriter.</p>
    <div aria-live="polite">
      {loading && <div className="notice"><Info size={17} aria-hidden="true" />Discovering available fields and reading the queue. Large queues may take a few minutes.</div>}
      {error && <div role="alert" className="alert"><WarningCircle size={17} aria-hidden="true" />{error}</div>}
      {stopped && <div className="notice" role="status">Live ranking stopped.</div>}
    </div>
    <PdfTriage />
    {!report && !loading && !error && <div className="card"><p className="empty-state">Run triage to discover the resource and see ranked records, per-factor scores, and the reasoning behind each query.</p></div>}
    {report && <>
      <p className="triage-meta"><span>{report.evaluated} of {report.total} <code>{report.resource}</code> records evaluated</span><span aria-hidden="true">·</span><time dateTime={report.generatedAt}>{new Date(report.generatedAt).toLocaleString()}</time></p>
      {report.resource === "Policy" && <p className="subtle">Scope: Policy records across lifecycle statuses.</p>}
      {report.resource === "Submission" && <p className="subtle">Scope: actual submissions across all lifecycle statuses, including unmatched submissions. Policy evidence is used only for verified unique links.</p>}
      {report.enrichmentComplete === false && <p className="notice">Policy lookup was partial, so the ranking relies on submission data alone.</p>}
      {report.ranked.length > 0 && report.ranked.every((item) => item.criteria.some((criterion) => criterion.status === "outside")) && <div className="notice"><Warning size={17} aria-hidden="true" />Every evaluated record has at least one appetite exception, so this list shows the closest fits in scope.</div>}
      {report.truncated && <div className="notice"><Info size={17} aria-hidden="true" />Partial ranking: the 1,000-record limit was reached. Results cover only the evaluated records.</div>}
      {queue && <section className="queue-health" aria-label="Queue review status">
        <dl><div><dt>Ready for review</dt><dd>{queue.ready}</dd></div><div><dt>Needs information</dt><dd>{queue.incomplete}</dd></div><div><dt>Appetite exceptions</dt><dd>{queue.exceptions}</dd></div></dl>
        <p className="subtle">Across all evaluated records. {queue.withEvidenceGaps} also have evidence gaps, including records with exceptions. Ready for review does not mean approved.</p>
      </section>}
      <details className="triage-plan popup">
        <summary>Query reasoning and scoring method</summary>
        <div className="triage-plan-body">
          <p><span className="annotation">{report.guidelineVersion}</span></p>
          <p>Eight weighted criteria total 100 points. Target matches earn full points; acceptable matches earn 80%; unknowns and exceptions earn zero. Exceptions cap the total at 49; incomplete required data caps it at 69. Weights and caps are choices made in this app.</p>
          <ul>{report.reasoning.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          {report.trace.map((step, index) => <details key={index}><summary>Query {index + 1}: {step.returned} records</summary><p>{step.reason}</p><pre>{JSON.stringify(step.query, null, 2)}</pre></details>)}
        </div>
      </details>
      <div className="section-heading"><div><h2>{showAll ? `All evaluated ${labels?.plural}` : `Top ${report.top} ${labels?.plural}`}</h2><p className="subtle">Start with the recommended action, then open the evidence when you need the detail.</p></div><div className="actions"><button className="quiet-button" onClick={downloadSlides} disabled={exporting} title="Download the displayed results as an editable PowerPoint deck"><DownloadSimple size={15} />{exporting ? "Creating slides…" : "Download slides"}</button><button className="quiet-button" onClick={() => window.print()}><Printer size={15} />Print / save PDF</button><button className="quiet-button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show top results" : "Show all results"}</button></div></div>
      {exportError && <p role="alert" className="alert">{exportError}</p>}
      <p role="status" className="subtle">{exporting ? "Preparing your PowerPoint deck…" : `Slide export includes ${showAll ? "all evaluated" : "the top-ranked"} ${labels?.plural} shown below (.pptx).`}</p>
      <p className="subtle triage-ranking-note">{rankingExplanation}</p>
      {!rows.length && <div className="card"><p className="empty-state">The API returned an empty queue.</p></div>}
      <div className="triage-list">
        {rows.map((item, index) => { const summary = summarizeSubmission(item); const plan = buildReviewPlan(item); const Icon = summary.status === "positive" ? CheckCircle : summary.status === "refer" ? Warning : WarningCircle; return <article key={item.id} className="triage-card card">
          <div className="card-header"><h2><span className="rank" aria-label={`Rank ${index + 1}`}>{index + 1}</span>{item.account}</h2><div className="triage-scores"><div><span className="subtle">Match score</span><span className="score">{item.rawScore}<small>/100</small></span></div><p className="subtle">Priority score: {item.score}/100</p></div></div>
          <p className="subtle triage-provenance">Lifecycle status: {item.lifecycleStatus}. {item.evidenceNote}</p>
          <div className="card-body"><div className={`decision-banner decision-${summary.status}`}><Icon size={18} aria-hidden="true" /><div><strong>{summary.title}</strong><span>{summary.plainExplanation}</span></div></div><p className="next-action"><strong>Next step:</strong> {summary.action}</p><div className="plain-facts">{summary.strengths.length > 0 && <div><strong>What supports this:</strong> {summary.strengths.join(", ")}</div>}{summary.questions.length > 0 && <div><strong>What to check:</strong> {summary.questions.join(", ")}</div>}</div><details className="technical-detail"><summary>Show the detailed reasoning</summary><p className="subtle" style={{ marginBottom: 10 }}><span className="annotation">{labels?.singular} {item.id}</span> {item.recommendation}</p><p>{item.explanation}</p></details></div>
          <details className="review-plan"><summary>Review checklist · {plan.exceptions} exceptions · {plan.gaps} evidence gaps</summary>
            <div className="review-plan-body"><p className="subtle">{plan.assessed} of {plan.total} appetite factors can be assessed from supplied data. This measures availability, not independent verification or approval.</p>
              {plan.tasks.length ? <ol>{plan.tasks.map((task) => <li key={`${task.kind}-${task.factor}`}><strong>{task.kind === "exception" ? "Refer" : "Clarify"}: {task.factor}</strong><p>{task.action}</p><details><summary>Evidence behind this task</summary><p>{task.reason}</p><p className="subtle">Source: {task.source ?? "Required submission context; no supporting field available"}</p></details></li>)}</ol> : <p>No unresolved appetite checks. Confirm source accuracy before an underwriter makes the final decision.</p>}
              <p className="subtle">Checklist only: no documents have been requested and no exceptions have been approved.</p>
            </div>
          </details>
          <details><summary>Appetite breakdown and data sources</summary><AppetiteCriteriaTable criteria={item.criteria} detailed /></details>
        </article>; })}
      </div>
    </>}
  </main>;
}
