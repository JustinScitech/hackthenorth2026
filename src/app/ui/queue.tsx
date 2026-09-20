"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowsClockwise, DownloadSimple, FolderPlus, Info, ListNumbers, Printer, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { dispositionOrder, nextStep, type Disposition, type NextStep } from "@/federato/disposition";
import { caseFromSubmission } from "@/federato/open-case";
import { resourceLabels } from "@/federato/presentation";
import { buildReviewPlan, summarizeQueue } from "@/federato/review-plan";
import type { StoredTriageReport } from "@/federato/reports";
import type { RankedSubmission } from "@/federato/scoring";
import { loadCases } from "./load-cases";
import { PdfTriage } from "./pdf-triage";

type Row = { item: RankedSubmission; rank: number; step: NextStep; property: boolean };
type LineFilter = "property" | "all";
type BucketFilter = Disposition | "all";

export const dispositionSlug: Record<Disposition, string> = { Target: "target", Acceptable: "acceptable", "Needs information": "needs", "Outside appetite": "outside" };

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
}

function summaryLine(rows: Row[], line: LineFilter): string {
  const parts = dispositionOrder.map((disposition) => [rows.filter((row) => row.step.disposition === disposition).length, disposition] as const).filter(([count]) => count > 0)
    .map(([count, disposition]) => `${count} ${disposition === "Needs information" ? "need information" : disposition === "Outside appetite" ? "outside appetite" : disposition.toLowerCase()}`);
  const scope = line === "property" ? "property submissions" : "submissions across every line";
  return `${rows.length} ${scope}${parts.length ? `: ${parts.join(", ")}.` : "."}`;
}

export function Queue() {
  const [report, setReport] = useState<StoredTriageReport | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [ranking, setRanking] = useState(false);
  const [stopped, setStopped] = useState(false);
  const runController = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [line, setLine] = useState<LineFilter>("property");
  const [bucket, setBucket] = useState<BucketFilter>("all");
  const [opened, setOpened] = useState<Map<string, string>>(new Map());
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/triage", { cache: "no-store" });
        const data: unknown = await response.json().catch(() => null);
        if (!cancelled && response.ok && data && typeof data === "object" && "report" in data && data.report) setReport(data.report as StoredTriageReport);
      } catch { /* the page still offers a fresh run */ }
      finally { if (!cancelled) setLoadingLatest(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    loadCases().then((cases) => {
      const map = new Map<string, string>();
      for (const record of cases) if (record.origin?.system === "federato" && !map.has(record.origin.id)) map.set(record.origin.id, record.id);
      setOpened(map);
    }).catch(() => { /* the queue works without the case list */ });
  }, []);

  async function rank() {
    const controller = new AbortController();
    runController.current = controller;
    setRanking(true); setStopped(false); setError(""); setOpenError("");
    try {
      const response = await fetch("/api/triage", { method: "POST", signal: controller.signal });
      const data = await response.json();
      controller.signal.throwIfAborted();
      if (!response.ok) throw new Error(data.error ?? "Unable to rank the queue.");
      setReport(data); setBucket("all");
    } catch (err) { if (controller.signal.aborted) setStopped(true); else setError(err instanceof Error ? err.message : "Unable to rank the queue."); }
    finally { if (runController.current === controller) runController.current = null; setRanking(false); }
  }

  async function openCase(row: Row) {
    if (!report) return;
    setOpening(row.item.id); setOpenError("");
    try {
      const body = caseFromSubmission(row.item, { resource: report.resource, rank: row.rank, of: report.evaluated, rankedAt: report.generatedAt });
      const response = await fetch("/api/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data: unknown = await response.json().catch(() => null);
      const id = data && typeof data === "object" && "id" in data && typeof data.id === "string" ? data.id : null;
      if (!response.ok || !id) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Could not open this submission as a case.");
      setOpened((current) => new Map(current).set(row.item.id, id));
      window.location.assign(`/cases/${id}`);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "Could not open this submission as a case.");
      setOpening(null);
    }
  }

  async function downloadSlides() {
    if (!report || exporting) return;
    setExporting(true);
    try {
      const { downloadTriageSlides } = await import("@/federato/slides");
      await downloadTriageSlides(report, line === "all");
    } catch { setError("Could not create the slide deck. Please try again."); }
    finally { setExporting(false); }
  }

  const rows = useMemo<Row[]>(() => report ? report.ranked.map((item, index) => ({ item, rank: index + 1, step: nextStep(item), property: item.criteria.find((criterion) => criterion.concept === "line")?.status !== "outside" })) : [], [report]);
  const inLine = rows.filter((row) => line === "all" || row.property);
  const visible = inLine.filter((row) => bucket === "all" || row.step.disposition === bucket);
  const countIn = (disposition: BucketFilter) => disposition === "all" ? inLine.length : inLine.filter((row) => row.step.disposition === disposition).length;
  const labels = report ? resourceLabels(report.resource) : null;
  const health = report ? summarizeQueue(report.ranked) : null;

  return <main className="shell triage-page queue-page">
    <p className="breadcrumb"><Link href="/overview">Commercial property</Link><span className="sep">/</span><span className="current">Queue</span></p>
    <div className="page-heading triage-heading">
      <div><p className="eyebrow">Federato · live</p><h1>Queue</h1><p className="subtle">Every submission in the carrier&apos;s queue, read against the 2025 commercial property appetite. Each row says where it stands, why, and what would change it.</p></div>
      <div className="actions"><button className="primary-button" onClick={rank} disabled={ranking || exporting}><ListNumbers size={16} />{ranking ? "Reading the queue…" : report ? "Rank again" : "Rank the live queue"}</button>{ranking && <button className="quiet-button" type="button" onClick={() => runController.current?.abort()}>Stop ranking</button>}</div>
    </div>
    <div aria-live="polite">
      {ranking && <div className="notice"><Info size={17} aria-hidden="true" />Discovering the schema, reading every submission and linked policy, and scoring the queue. About fifteen seconds.</div>}
      {stopped && <div className="notice" role="status">Live ranking stopped.</div>}
      {error && <div role="alert" className="alert"><WarningCircle size={17} aria-hidden="true" />{error}</div>}
      {openError && <div role="alert" className="alert"><WarningCircle size={17} aria-hidden="true" />{openError}</div>}
    </div>
    <PdfTriage />
    {!report && !ranking && !loadingLatest && !error && <div className="card"><div className="panel-empty"><span className="empty-icon"><ListNumbers size={22} /></span><strong>The queue has yet to be ranked.</strong><p>Rank it once and every submission gets a disposition, a one-line reason, and a next step. The result stays here for the next visit.</p><button className="primary-button accent" type="button" onClick={rank}>Rank the live queue</button></div></div>}
    {!report && loadingLatest && <p className="subtle">Loading the last ranked queue…</p>}
    {report && <>
      <div className="queue-toolbar">
        <p className="triage-meta"><span>{report.evaluated} of {report.total} {labels?.plural} ranked</span><span aria-hidden="true">·</span><time dateTime={report.generatedAt} title={new Date(report.generatedAt).toLocaleString()}>{ago(report.generatedAt)}</time>{report.truncated && <span className="annotation">partial: 1,000-record limit</span>}{report.enrichmentComplete === false && <span className="annotation">policy lookup partial</span>}</p>
        <details className="tool-menu">
          <summary className="quiet-button">More</summary>
          <div className="tool-menu-list popup">
            <button className="quiet-button" type="button" onClick={downloadSlides} disabled={exporting}><DownloadSimple size={15} />{exporting ? "Creating slides…" : "Download slides"}</button>
            <button className="quiet-button" type="button" onClick={() => window.print()}><Printer size={15} />Print / save PDF</button>
          </div>
        </details>
      </div>
      <div className="queue-filters" role="group" aria-label="Line of business">
        <button type="button" className="chip" aria-pressed={line === "property"} onClick={() => { setLine("property"); setBucket("all"); }}>Property lines <b>{rows.filter((row) => row.property).length}</b></button>
        <button type="button" className="chip" aria-pressed={line === "all"} onClick={() => { setLine("all"); setBucket("all"); }}>All lines <b>{rows.length}</b></button>
      </div>
      <div className="queue-filters" role="group" aria-label="Disposition">
        <button type="button" className="chip" aria-pressed={bucket === "all"} onClick={() => setBucket("all")}>All <b>{countIn("all")}</b></button>
        {dispositionOrder.map((disposition) => <button key={disposition} type="button" className={`chip chip-${dispositionSlug[disposition]}`} aria-pressed={bucket === disposition} onClick={() => setBucket(disposition)}>{disposition} <b>{countIn(disposition)}</b></button>)}
      </div>
      <p className="lede queue-summary">{summaryLine(inLine, line)}</p>
      {health && <section className="queue-health" aria-label="Queue review status">
        <dl><div><dt>Ready for review</dt><dd>{health.ready}</dd></div><div><dt>Needs information</dt><dd>{health.incomplete}</dd></div><div><dt>Appetite exceptions</dt><dd>{health.exceptions}</dd></div></dl>
        <p className="subtle">Across all evaluated records. {health.withEvidenceGaps} also have evidence gaps, including records with exceptions. Ready for review does not mean approved.</p>
      </section>}
      {!visible.length && <div className="card"><p className="empty-state">{rows.length ? "Nothing matches these filters." : "The API returned an empty queue."}</p></div>}
      <ol className="queue-list" aria-label="Ranked submissions">
        {visible.map((row) => {
          const { item, step } = row;
          const plan = buildReviewPlan(item);
          const caseId = opened.get(item.id);
          const lifecycle = item.lifecycleStatus && item.lifecycleStatus !== "unknown" ? ` · ${item.lifecycleStatus}` : "";
          return <li className="queue-row" key={item.id}>
            <span className="queue-rank" aria-label={`Rank ${row.rank}`}>{row.rank}</span>
            <div className="queue-main">
              <div className="queue-title"><h2>{item.account}</h2><span className={`disposition disposition-${dispositionSlug[step.disposition]}`}>{step.disposition}</span><small>{labels?.singular} {item.id}{lifecycle}</small></div>
              <p className="queue-why">{step.why}</p>
              <p className="queue-action"><strong>Next:</strong> {step.action}</p>
              {step.disposition === "Needs information" && step.questions.length <= 3 && <ul className="queue-questions">{step.questions.map((question) => <li key={question.item}><strong>{question.item}</strong>: {question.source}</li>)}</ul>}
              {(item.counterfactuals?.length ?? 0) > 0 && <ul className="queue-changes" aria-label="What would change it">{item.counterfactuals!.map((change) => <li key={change.concept}><strong>{change.factor}</strong>: {change.condition}</li>)}</ul>}
              <details className="queue-details review-plan">
                <summary>Review checklist · {plan.exceptions} exceptions · {plan.gaps} evidence gaps</summary>
                <div className="review-plan-body">
                <p className="subtle">{plan.assessed} of {plan.total} appetite factors can be assessed from supplied data. This measures availability, not independent verification or approval.</p>
                {plan.tasks.length ? <ol className="review-tasks">{plan.tasks.map((task) => <li key={task.factor}><span className="review-task-head"><strong>{task.factor}</strong><span className={`disposition ${task.kind === "exception" ? "disposition-outside" : "disposition-needs"}`}>{task.kind === "exception" ? "exception" : "evidence gap"}</span></span><p>{task.action}</p><small>{task.reason}{task.source ? ` Source: ${task.source}.` : ""}</small></li>)}</ol> : <p>No unresolved appetite checks.</p>}
                <p className="subtle">{item.evidenceNote}</p>
                <div className="triage-table-wrap"><table className="triage-table"><thead><tr><th>Factor</th><th>Result</th><th>Points</th><th>Evidence and rule</th></tr></thead><tbody>{item.criteria.map((criterion) => <tr key={criterion.factor}><th scope="row">{criterion.factor}</th><td>{criterion.status}</td><td>{criterion.points}/{criterion.maximum}</td><td>{criterion.detail}<small>Source: {criterion.source}</small></td></tr>)}</tbody></table></div>
                <p className="subtle">{item.explanation}</p>
                </div>
              </details>
            </div>
            <div className="queue-side">
              <span className="queue-score" title="Fit score: weighted guideline matches, capped at 49 with an exception and 69 with open answers">{item.score}<small>/100</small></span>
              {caseId
                ? <Link className="secondary-button" href={`/cases/${caseId}`}>Open case<ArrowRight size={15} /></Link>
                : <button className="secondary-button" type="button" disabled={opening !== null} onClick={() => openCase(row)}><FolderPlus size={15} />{opening === item.id ? "Opening…" : "Open as case"}</button>}
            </div>
          </li>;
        })}
      </ol>
      <details className="triage-plan popup">
        <summary><ArrowsClockwise size={15} aria-hidden="true" />How the queue was read: {report.trace.length} queries against {report.resource}</summary>
        <div className="triage-plan-body">
          <p><span className="annotation">{report.guidelineVersion}</span></p>
          <p>Eight weighted factors total 100 points. Target matches earn full points; acceptable matches earn 80%; open and outside factors earn zero. An exception caps the score at 49; open answers cap it at 69. Weights and caps are choices made in this app; the thresholds are the carrier&apos;s.</p>
          <ul>{report.reasoning.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          {report.trace.map((step, index) => <details key={index}><summary>Query {index + 1}: {step.returned} records</summary><p>{step.reason}</p><pre>{JSON.stringify(step.query, null, 2)}</pre></details>)}
        </div>
      </details>
    </>}
    <p className="demo-note">Scores order the queue for human review. Quoting and binding stay with the carrier.</p>
  </main>;
}
