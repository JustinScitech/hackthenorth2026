import type { Metadata } from "next";
import { Queue } from "@/app/ui/queue";

import { useState } from "react";
import Link from "next/link";
import { DownloadSimple, Info, ListNumbers, Printer, Warning, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { TriageReport } from "@/federato/triage";
import { rankingExplanation, resourceLabels } from "@/federato/presentation";
import { summarizeQueue } from "@/federato/review-plan";
import { readReviewStream, type ReviewProgress } from "@/lib/review-stream";
import { ReviewActivity } from "@/app/ui/review-activity";
import { ReviewResult } from "@/app/ui/review-result";
import { AgentChat, type ChatTurn } from "@/app/ui/agent-chat";

type Report = Omit<TriageReport, "schema"> & { chatSignatures: Record<string, string> };
export default function TriagePage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activity, setActivity] = useState<ReviewProgress[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  async function run() {
    setLoading(true); setError(""); setExportError(""); setReport(null); setActivity([]); setSelectedId(null); setChatTurns([]);
    try {
      const response = await fetch("/api/triage", { method: "POST" });
      let completed = false;
      if (response.headers.get("content-type")?.includes("text/event-stream")) {
        await readReviewStream<Report>(response, (event) => {
          if (event.type === "progress") setActivity((current) => [...current, event.data]);
          if (event.type === "result") { completed = true; setReport(event.data); setShowAll(false); }
        });
      } else {
        const data = await response.json() as Report & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Unable to rank the queue.");
        setReport({ ...data, chatSignatures: data.chatSignatures ?? {} });
        setShowAll(false);
        completed = true;
      }
      if (!completed) throw new Error("The live review was interrupted. Run it again.");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to rank the queue."); }
    finally { setLoading(false); }
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
      <button className="primary-button" onClick={run} disabled={loading || exporting}><ListNumbers size={16} />{loading ? "Discovering and scoring…" : "Rank live records"}</button>
    </div>
    <p className="lede">Scores order the queue for human review. Approval and binding stay with the underwriter.</p>
    <div aria-live="polite">
      {loading && <ReviewActivity events={activity} working />}
      {error && <div role="alert" className="alert"><WarningCircle size={17} aria-hidden="true" />{error}</div>}
    </div>
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
        {rows.map((item, index) => <article key={item.id} className="triage-card card">
          <ReviewResult result={item} rank={index + 1} label={labels?.singular} />
          {report?.chatSignatures[item.id] && <div className="triage-card-agent"><button className="secondary-button" type="button" onClick={() => { setSelectedId(selectedId === item.id ? null : item.id); setChatTurns([]); }}>{selectedId === item.id ? "Close agent chat" : "Ask the agent about this record"}</button></div>}
          {selectedId === item.id && report && <AgentChat key={item.id} endpoint="/api/triage/chat" context={{ resource: report.resource, generatedAt: report.generatedAt, item, signature: report.chatSignatures[item.id] }} voiceAvailable={false} turns={chatTurns} setTurns={setChatTurns} />}
        </article>)}
      </div>
    </>}
  </main>;
export const metadata: Metadata = { title: "Queue" };

export default function TriagePage() {
  return <Queue />;
}
