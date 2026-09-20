"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowSquareOut, Check, Clock, FileText, ListChecks, MapPin, PaperPlaneTilt, ShieldCheck, WarningCircle, X } from "@phosphor-icons/react/dist/ssr";
import type { AuditEvent, CaseRecord, CaseStatus, Fact, JobStatus } from "@/lib/types";
import { Mark } from "./logo";
import { Status } from "./status";
import { VoiceBrief } from "./voice-brief";
import { AgentChat, type ChatTurn } from "./agent-chat";
import { CasePdfExport } from "./case-pdf-export";
import { CaseReportEditor } from "./case-report-editor";
import { SourcePicker } from "./source-picker";
import { summarizeSubmission } from "@/federato/presentation";

/** The worker is still on this case: nothing final has landed yet, so the page should visibly move. */
function isProcessing(caseRecord: CaseRecord, jobStatus: JobStatus) {
  return ["received", "extracting", "checking"].includes(caseRecord.status) && jobStatus !== "FAILED";
}

type ActionKind = "approve" | "decline";

function FactRow<T>({ label, fact, format = String }: { label: string; fact: Fact<T>; format?: (value: T) => string }) {
  return <div className="fact-row"><span>{label}</span><strong>{fact.value === null ? "Not provided" : format(fact.value)}</strong><small>{fact.source} · {Math.round(fact.confidence * 100)}% confidence</small></div>;
}

function Findings({ caseRecord }: { caseRecord: CaseRecord }) {
  if (!caseRecord.findings) return null;
  return <section className="detail-section" aria-labelledby="findings-title">
    <div className="section-heading"><h2 id="findings-title">{caseRecord.appetiteResult ? "Carrier appetite checks" : "Legacy guideline checks"}</h2><span className="count">{caseRecord.findings.length}</span></div>
    <div className="findings">{caseRecord.findings.map((finding) => (
      <div className="finding" key={finding.id}>
        <span className={`finding-mark finding-${finding.result}`} aria-hidden="true">
          {finding.result === "pass" ? <Check size={15} /> : finding.result === "refer" ? <WarningCircle size={15} /> : <Clock size={15} />}
        </span>
        <div><strong>{finding.label}</strong><p>{finding.detail}</p><span className="annotation">source: {finding.source}</span></div>
      </div>
    ))}</div>
  </section>;
}

/** The public record behind the address: every dataset with its one-line reading and a link, then the points it moved. */
function PropertyContextSection({ context, result }: { context: CaseRecord["propertyContext"]; result: CaseRecord["appetiteResult"] }) {
  if (!context) return null;
  const adjustments = result?.adjustments ?? [];
  const moved = adjustments.reduce((sum, item) => sum + item.points, 0);
  return <section className="detail-section" aria-labelledby="context-title">
    <div className="section-heading"><h2 id="context-title">Public property records</h2><MapPin size={16} aria-hidden="true" /></div>
    {context.geocoded
      ? <p className="subtle">{context.geocoded.matchedAddress}{context.geocoded.countyName ? ` · ${context.geocoded.countyName}` : ""} · <a className="text-link" href={context.geocodeUrl} target="_blank" rel="noopener noreferrer">Census geocoder</a></p>
      : <p className="notice">The address “{context.address}” could not be placed on the map, so no public records were pulled.</p>}
    {context.sources.length > 0 && <ul className="context-list">
      {context.sources.map((source) => <li key={source.id} className={source.status === "ok" ? undefined : "is-unavailable"}>
        <strong>{source.label}</strong>
        <span>{source.summary}</span>
        {source.status === "ok" && source.url && <a className="text-link" href={source.url} target="_blank" rel="noopener noreferrer">Source</a>}
      </li>)}
    </ul>}
    {adjustments.length > 0 && <div className="context-adjustments">
      <p className="subtle">Priority moved {moved >= 0 ? "+" : ""}{moved} from {result?.baseScore} to {result?.score}. Point values are application choices, listed so they can be checked.</p>
      <ul>{adjustments.map((item) => <li key={item.label}><span className={`points ${item.points >= 0 ? "is-up" : "is-down"}`}>{item.points >= 0 ? "+" : ""}{item.points}</span><strong>{item.label}</strong><span>{item.detail}</span></li>)}</ul>
    </div>}
  </section>;
}

function BrokerAction({ question, response, setResponse, submitting, onSubmit }: {
  question: string | null; response: string; setResponse: (value: string) => void;
  submitting: boolean; onSubmit: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSubmit(); }
  return <section className="action-section" aria-labelledby="broker-title">
    <div className="section-heading"><h2 id="broker-title">Broker information needed</h2><PaperPlaneTilt size={16} aria-hidden="true" /></div>
    <p>{question}</p>
    <form onSubmit={submit}>
      <label>Broker response<textarea required minLength={3} maxLength={10000} rows={4} value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Enter the broker's reply..." /></label>
      <button className="primary-button" disabled={submitting} type="submit"><PaperPlaneTilt size={15} />{submitting ? "Sending..." : "Add response and resume"}</button>
    </form>
  </section>;
}

function ReviewAction({ reason, setReason, submitting, onDecision }: {
  reason: string; setReason: (value: string) => void; submitting: boolean;
  onDecision: (kind: ActionKind) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onDecision("approve"); }
  return <section className="action-section" aria-labelledby="decision-title">
    <div className="section-heading"><h2 id="decision-title">Underwriter decision</h2></div>
    <form onSubmit={submit}>
      <label>Review rationale<textarea required minLength={3} maxLength={2000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record the reason for your decision..." /></label>
      <div className="decision-actions">
        <button className="primary-button" disabled={submitting || reason.trim().length < 3} type="submit"><Check size={15} />Approve review</button>
        <button className="secondary-button" disabled={submitting || reason.trim().length < 3} onClick={() => onDecision("decline")} type="button"><X size={15} />Decline</button>
      </div>
    </form>
  </section>;
}

function CaseActions({ caseRecord, response, setResponse, reason, setReason, submitting, onResponse, onDecision }: {
  caseRecord: CaseRecord; response: string; setResponse: (value: string) => void;
  reason: string; setReason: (value: string) => void; submitting: boolean;
  onResponse: () => void; onDecision: (kind: ActionKind) => void;
}) {
  if (caseRecord.status === "waiting_for_broker") return <BrokerAction question={caseRecord.question} response={response} setResponse={setResponse} submitting={submitting} onSubmit={onResponse} />;
  if (caseRecord.status === "review_ready") return <ReviewAction reason={reason} setReason={setReason} submitting={submitting} onDecision={onDecision} />;
  if (caseRecord.status === "approved" || caseRecord.status === "declined") return <section className="detail-section"><div className="section-heading"><h2>Decision rationale</h2><Status value={caseRecord.status} /></div><p className="brief">{caseRecord.decision}</p></section>;
  return null;
}

const eventLabels: Record<string, string> = {
  case_created: "Submission received", extraction_started: "Reading submission",
  source_documents_loaded: "Source material loaded",
  model_extraction_started: "Model extraction started", extraction_completed: "Facts extracted",
  gemini_model_started: "Gemini model started", gemini_model_completed: "Gemini model completed",
  gemini_model_failed: "Gemini model unavailable",
  openai_model_started: "OpenAI model started", openai_model_completed: "OpenAI model completed",
  openai_model_failed: "OpenAI model unavailable",
  public_research_started: "Public source visit started",
  public_research_skipped: "Public research skipped", public_research_completed: "Public source reviewed",
  public_research_failed: "Public research unavailable", guideline_check_started: "Checking carrier appetite",
  source_discovery_started: "Searching for a public source", source_discovery_completed: "Public source candidates found",
  source_discovery_failed: "Public source search unavailable", public_source_confirmed: "Public source confirmed",
  property_context_started: "Looking up public property records", property_context_completed: "Public property records gathered",
  property_context_skipped: "Public records skipped", property_context_failed: "Public records unavailable",
  analysis_completed: "Guidelines checked",
  broker_response_received: "Broker response received", broker_follow_up_due: "Broker follow-up due",
  approved: "Review approved", declined: "Review declined", job_failed: "Analysis failed",
  job_retry: "Retrying analysis", report_edited: "Report edited",
};

function traceDetail(event: AuditEvent): string | null {
  if (event.eventType === "source_documents_loaded") {
    const count = Number(event.detail.count ?? 1);
    return count === 1 ? "Submission source read for this analysis." : `Submission and ${count - 1} broker ${count === 2 ? "response" : "responses"} read for this analysis.`;
  }
  if (event.eventType === "case_created") return "Intake form saved and analysis queued.";
  if (event.eventType === "extraction_started") return `Starting fact extraction for analysis revision ${event.detail.revision ?? 0}.`;
  if (event.eventType === "guideline_check_started") return "Evaluating the extracted facts against carrier appetite rules.";
  if (event.eventType === "model_extraction_started") {
    const providers = Array.isArray(event.detail.providers) ? event.detail.providers.join(" and ") : "available models";
    return `Extracting facts with ${providers}; results will be compared with the parser.`;
  }
  if (/_model_(started|completed|failed)$/.test(event.eventType)) {
    const model = String(event.detail.model ?? event.eventType.split("_")[0]);
    if (event.eventType.endsWith("_started")) return `${model} is reading the supplied source material.`;
    if (event.eventType.endsWith("_failed")) return `${model} could not complete${event.detail.errorCode ? ` (${event.detail.errorCode})` : ""}. The analysis can use other available reads.`;
    return `${model} completed${typeof event.detail.durationMs === "number" ? ` in ${(event.detail.durationMs / 1000).toFixed(1)}s` : ""}.`;
  }
  if (event.eventType === "extraction_completed") {
    const attempts = Array.isArray(event.detail.attempts) ? event.detail.attempts as { status: string }[] : [];
    const completed = attempts.some((attempt) => attempt.status === "completed");
    const failed = attempts.some((attempt) => attempt.status === "failed");
    const source = completed ? "Broker facts extracted with parser cross-check."
      : failed ? "Model extraction unavailable; parser fallback used." : "Parser only; no model configured";
    const missing = Array.isArray(event.detail.missing) && event.detail.missing.length ? ` Missing: ${event.detail.missing.join(", ")}.` : "";
    return source + missing;
  }
  if (event.eventType === "analysis_completed") {
    if (typeof event.detail.pass !== "number") return String(event.detail.status ?? "Analysis complete").replaceAll("_", " ");
    return `Guideline checks · ${event.detail.pass} passed · ${event.detail.refer} referred · ${event.detail.unknown} unknown`;
  }
  if (event.eventType === "public_research_skipped") return String(event.detail.reason ?? "Public research was skipped");
  if (event.eventType === "source_discovery_completed") {
    const candidates = Array.isArray(event.detail.candidates) ? event.detail.candidates as { url: string; confidence: number }[] : [];
    return candidates.length ? `${candidates.length} candidate page${candidates.length === 1 ? "" : "s"} for the underwriter to confirm · best ${candidates[0].confidence.toFixed(2)}` : "No likely assessor record found; a URL can be entered on the case";
  }
  if (event.eventType === "source_discovery_failed") return String(event.detail.reason ?? "The search did not complete");
  if (event.eventType === "public_source_confirmed") return `${event.detail.url}${event.detail.candidate ? " (discovered candidate)" : " (entered by the underwriter)"}`;
  if (event.eventType === "property_context_skipped" || event.eventType === "property_context_failed") return String(event.detail.reason ?? "");
  if (event.eventType === "property_context_completed") return `${event.detail.ok} of ${event.detail.total} public datasets answered for ${event.detail.matched}`;
  if (event.eventType === "public_research_completed") {
    const signals = Array.isArray(event.detail.signals) ? event.detail.signals as string[] : [];
    const conflicts = Number(event.detail.conflicts ?? 0);
    return (signals.length ? `Public source saved as evidence · ${signals.length} signal${signals.length === 1 ? "" : "s"}: ${signals.join(", ")}` : "Public source saved as evidence") + (conflicts ? ` · ${conflicts} parser/model conflict${conflicts === 1 ? "" : "s"} referred` : "");
  }
  if (event.eventType === "broker_follow_up_due") return "24-hour wait elapsed; the case is still waiting on the broker";
  if (event.eventType === "public_research_failed" || event.eventType === "job_retry" || event.eventType === "job_failed") return String(event.detail.reason ?? "The step could not complete.");
  return null;
}

function AnalysisTrace({ audit, working, jobStatus }: { audit: AuditEvent[]; working: boolean; jobStatus: JobStatus }) {
  const latest = audit.at(-1);
  const active = working && jobStatus === "RUNNING" && latest && (latest.eventType.endsWith("_started") || latest.eventType === "case_created");
  return <section className="analysis-trace-region" aria-label="Activity trace"><details className={`analysis-trace${working ? " is-working" : ""}`} open={working}>
    <summary className="trace-header"><span><ListChecks size={16} /> Agent activity <small>{audit.length} recorded steps · {working ? "live" : "saved"}</small></span><span className="trace-toggle">{working ? "Live updates" : "View steps"}</span></summary>
    <ol className="trace-list" aria-label="Agent activity history">{audit.map((event) => {
      const isActive = active && event.id === latest.id;
      const isFailure = event.eventType.endsWith("_failed") || event.eventType === "job_retry";
      return <li key={event.id} data-state={isActive ? "active" : isFailure ? "failed" : event.eventType.endsWith("_started") ? "recorded" : "done"}>
        <div className="trace-heading"><strong>{eventLabels[event.eventType] ?? event.eventType.replaceAll("_", " ")}</strong><span className="trace-meta">{isActive && <em>In progress</em>}<time dateTime={event.createdAt}>{new Date(event.createdAt).toISOString().slice(0, 19).replace("T", " ")} UTC</time></span></div>
        {traceDetail(event) && <p>{traceDetail(event)}</p>}
      </li>;
    })}</ol>
  </details></section>;
}

function jobMessage(caseRecord: CaseRecord, audit: AuditEvent[], jobStatus: JobStatus): string {
  const latest = audit.at(-1);
  const processing = ["received", "extracting", "checking"].includes(caseRecord.status);
  if (jobStatus === "FAILED") return "Analysis failed. Review the case error and activity trace.";
  if (processing && jobStatus === "RUNNING") {
    return latest?.eventType === "model_extraction_started" || /_model_started$/.test(latest?.eventType ?? "") ? "Astra is extracting the broker facts"
      : /_model_completed$/.test(latest?.eventType ?? "") ? "Astra is cross-checking the extracted facts"
      : /_model_failed$/.test(latest?.eventType ?? "") ? "Astra is extracting with the fallback parser"
      : latest?.eventType === "extraction_completed" ? "Astra has the facts and is moving to the guidelines"
      : latest?.eventType === "public_research_started" ? "Astra is reviewing the supplied public source"
      : latest?.eventType === "source_discovery_started" ? "Astra is searching for the assessor record"
        : latest?.eventType === "guideline_check_started" ? "Astra is checking the carrier appetite"
          : caseRecord.status === "received" ? "Astra is starting the analysis" : "Astra is reading the submission";
  }
  if (jobStatus === "QUEUED") return "Analysis queued";
  if (caseRecord.status === "waiting_for_broker") return "Waiting for broker information.";
  if (caseRecord.status === "review_ready") return "Analysis complete. Waiting for an underwriter decision.";
  if (jobStatus === "COMPLETED") return "Review completed.";
  return "Analysis in progress.";
}

function JobProgress({ caseRecord, audit, jobStatus }: { caseRecord: CaseRecord; audit: AuditEvent[]; jobStatus: JobStatus }) {
  return <div className="progress-line" role="status"><Clock size={16} aria-hidden="true" />{jobMessage(caseRecord, audit, jobStatus)}</div>;
}

const STAGES: { label: string; reached: CaseStatus[] }[] = [
  { label: "Received", reached: ["received"] },
  { label: "Extracting facts", reached: ["extracting"] },
  { label: "Checking guidelines", reached: ["checking", "waiting_for_broker"] },
  { label: "Ready for review", reached: ["review_ready", "approved", "declined"] },
];

function stageIndex(status: CaseStatus) {
  const index = STAGES.findIndex((stage) => stage.reached.includes(status));
  return index === -1 ? 0 : index;
}

function stageFocus(caseRecord: CaseRecord): string {
  switch (caseRecord.status) {
    case "received": return "The submission is queued for source reading and fact extraction.";
    case "extracting": return "Reading the submission and broker responses, then comparing extracted values with supplied intake fields.";
    case "checking": return "Checking carrier appetite factors and account context. Missing evidence may require a broker response.";
    default: return "";
  }
}

/**
 * Seconds since this browser first saw the run, ticking once a second. The start is kept in
 * sessionStorage per case so a refresh continues the count; the browser clock is the only clock
 * involved, so server time zones can't skew it. The entry is dropped once the run finishes.
 */
function useElapsedSeconds(caseId: string, running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const key = `astra.run-start.${caseId}`;
    if (!running) { try { sessionStorage.removeItem(key); } catch { /* storage may be unavailable */ } return; }
    let started = Date.now();
    try {
      const saved = Number(sessionStorage.getItem(key));
      if (saved > 0 && saved <= started) started = saved; else sessionStorage.setItem(key, String(started));
    } catch { /* storage may be unavailable */ }
    const tick = () => setSeconds(Math.floor((Date.now() - started) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [caseId, running]);
  return seconds;
}

const QUEUE_PATIENCE_SECONDS = 45;

/** Live status while the worker is on the case: the current step, the stage rail, and the agent's running commentary. */
function AgentWorking({ caseRecord, audit, jobStatus }: { caseRecord: CaseRecord; audit: AuditEvent[]; jobStatus: JobStatus }) {
  const current = stageIndex(caseRecord.status);
  const elapsed = useElapsedSeconds(caseRecord.id, true);
  const stalled = jobStatus === "QUEUED" && elapsed > QUEUE_PATIENCE_SECONDS;
  return <div className={`working${stalled ? " is-stalled" : ""}`} role="status" aria-live="polite">
    <span className="ring" aria-hidden="true"><i /></span>
    <div className="working-head">
      <span className="working-message"><span className="working-spinner" aria-hidden="true"><Mark size={16} /></span>{stalled ? "Waiting for the analysis service" : jobMessage(caseRecord, audit, jobStatus).replace(/\.$/, "")}<span className="working-ellipsis" aria-hidden="true" /></span>
      <time className="working-clock" dateTime={`PT${elapsed}S`}>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</time>
    </div>
    <ol className="working-rail" aria-label="Analysis stages">
      {STAGES.map((stage, index) => <li key={stage.label} data-state={index < current ? "done" : index === current ? "active" : "todo"}><span className="working-step" aria-hidden="true">{index < current && <Check size={10} weight="bold" />}</span>{stage.label}</li>)}
    </ol>
    {stalled
      ? <p className="working-focus working-stalled">This case is in the queue and will start automatically as soon as the analysis service is free. This page keeps checking on its own, so you can sit tight.</p>
      : <p className="working-focus">{stageFocus(caseRecord)}</p>}
  </div>;
}


export function CaseView({ id, caseRecord, audit, jobStatus, error, voiceAvailable, response, setResponse, reason, setReason, submitting, onResponse, onDecision, onReportSaved, onSourceConfirmed }: {
  id: string; caseRecord: CaseRecord; audit: AuditEvent[]; jobStatus: JobStatus; error: string | null; voiceAvailable: boolean;
  response: string; setResponse: (value: string) => void;
  reason: string; setReason: (value: string) => void; submitting: boolean;
  onResponse: () => void; onDecision: (kind: ActionKind) => void;
  onReportSaved: () => void; onSourceConfirmed: () => void;
}) {
  const working = isProcessing(caseRecord, jobStatus);
  useElapsedSeconds(id, working);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  return <main className="shell shell-narrow conversation">
    <div className="case-toolbar">
      <p className="breadcrumb"><Link href="/overview">Commercial property</Link><span className="sep">/</span><Link href="/cases">Cases</Link><span className="sep">/</span><span className="current">{caseRecord.insuredName}</span></p>
      <CasePdfExport id={id} conversation={chatTurns.map(({ role, text, edited }) => ({ role, text, edited }))} />
      <span className="case-id-label">case {id.slice(0, 8)}</span>
      <Status value={caseRecord.status} />
    </div>
    <CaseReportEditor key={`${id}:${caseRecord.analysisRevision}`} caseRecord={caseRecord} audit={audit} working={["received", "extracting", "checking"].includes(caseRecord.status)} onSaved={onReportSaved} />
    {error && <div className="alert" role="alert"><WarningCircle size={17} aria-hidden="true" />{error}</div>}
    <div className="conversation-message request-message">
      <div className="message-avatar requester-avatar"><FileText size={16} aria-hidden="true" /></div>
      <div className="message-content"><p className="message-label">Submission</p><h1>{caseRecord.insuredName}</h1><p>{caseRecord.state ? `${caseRecord.state} property` : "Primary state pending"} · {caseRecord.tiv === null ? "insured value pending" : `$${caseRecord.tiv.toLocaleString()} total insured value`}</p>{caseRecord.origin && <p className="case-origin">Opened from the Federato queue: {caseRecord.origin.resource} {caseRecord.origin.id}, ranked {caseRecord.origin.rank} of {caseRecord.origin.of}{caseRecord.origin.lifecycleStatus && caseRecord.origin.lifecycleStatus !== "unknown" ? ` · ${caseRecord.origin.lifecycleStatus}` : ""}.</p>}<time dateTime={caseRecord.createdAt}>{new Date(caseRecord.createdAt).toLocaleString()}</time></div>
    </div>
    <div className="conversation-message agent-message">
      <div className={`message-avatar agent-avatar${working ? " is-working" : ""}`}>{working && <span className="ring ring-fast" aria-hidden="true"><i /></span>}{working ? <Mark size={20} /> : <ShieldCheck size={18} weight="duotone" aria-hidden="true" />}</div>
      <div className="message-content">
        <p className="message-label">Underwriting agent{working && <span className="message-live">Working</span>}</p>
        {working ? <AgentWorking caseRecord={caseRecord} audit={audit} jobStatus={jobStatus} /> : <JobProgress caseRecord={caseRecord} audit={audit} jobStatus={jobStatus} />}
        {caseRecord.status === "failed" && <div className="alert"><WarningCircle size={17} aria-hidden="true" />{caseRecord.error ?? "Analysis failed."}</div>}
        {caseRecord.brief ? <p className="brief">{caseRecord.brief}</p> : !working && <p className="brief">Analysis is in progress.</p>}
        {caseRecord.appetiteResult && <NextStepPanel result={caseRecord.appetiteResult} origin={caseRecord.origin} />}
        {!caseRecord.appetiteResult && caseRecord.findings && <p className="notice">Legacy analysis: these saved findings predate the shared carrier appetite evaluator. Create a new review with complete appetite evidence before relying on them.</p>}
        {voiceAvailable && caseRecord.brief && <VoiceBrief id={id} />}
        <AnalysisTrace audit={audit} working={working} jobStatus={jobStatus} />
        {caseRecord.facts && <section className="detail-section" aria-labelledby="facts-title"><div className="section-heading"><h2 id="facts-title">Extracted facts</h2><FileText size={16} aria-hidden="true" /></div><div className="fact-list"><FactRow label="State" fact={caseRecord.facts.state} /><FactRow label="Total insured value" fact={caseRecord.facts.tiv} format={(value) => `$${value.toLocaleString()}`} /><FactRow label="Year built" fact={caseRecord.facts.yearBuilt} /><FactRow label="Loss count" fact={caseRecord.facts.losses} /></div></section>}
        <Findings caseRecord={caseRecord} />
        <PropertyContextSection context={caseRecord.propertyContext} result={caseRecord.appetiteResult} />
        {!working && <SourcePicker key={`${id}:${caseRecord.analysisRevision}`} id={id} caseRecord={caseRecord} onConfirmed={onSourceConfirmed} />}
        {caseRecord.publicEvidence && <section className="detail-section" aria-labelledby="evidence-title"><div className="section-heading"><h2 id="evidence-title">Public-source evidence</h2><ArrowSquareOut size={16} aria-hidden="true" /></div><p className="brief">{caseRecord.publicEvidence.excerpt}</p><div className="source-line"><a className="text-link" href={caseRecord.publicEvidence.url} target="_blank" rel="noopener noreferrer">{caseRecord.publicEvidence.title || caseRecord.publicEvidence.url}</a><span>External source; verify before relying on it.</span></div></section>}
      </div>
    </div>
    <div className="conversation-action"><CaseActions caseRecord={caseRecord} response={response} setResponse={setResponse} reason={reason} setReason={setReason} submitting={submitting} onResponse={onResponse} onDecision={onDecision} /></div>
    {!working && <div className="conversation-action"><AgentChat id={id} voiceAvailable={voiceAvailable} turns={chatTurns} setTurns={setChatTurns} /></div>}
    <p className="demo-note">New analyses use the supplied 2025 commercial property appetite. Quoting and binding stay with the carrier.</p>
  </main>;
}
