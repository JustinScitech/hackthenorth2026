"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowSquareOut, Check, Clock, FileText, ListChecks, PaperPlaneTilt, ShieldCheck, WarningCircle, X } from "@phosphor-icons/react/dist/ssr";
import type { AuditEvent, CaseRecord, CaseStatus, Fact, JobStatus } from "@/lib/types";
import { Mark } from "./logo";
import { Status } from "./status";
import { VoiceBrief } from "./voice-brief";

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
    <div className="section-heading"><h2 id="findings-title">Demo guideline checks</h2><span className="count">{caseRecord.findings.length}</span></div>
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
  model_extraction_started: "Model extraction started", extraction_completed: "Facts extracted",
  gemini_model_started: "Gemini model started", gemini_model_completed: "Gemini model completed",
  gemini_model_failed: "Gemini model unavailable",
  openai_model_started: "OpenAI model started", openai_model_completed: "OpenAI model completed",
  openai_model_failed: "OpenAI model unavailable",
  public_research_started: "Public source visit started",
  public_research_skipped: "Public research skipped", public_research_completed: "Public source reviewed",
  public_research_failed: "Public research unavailable", guideline_check_started: "Checking demo guidelines",
  analysis_completed: "Guidelines checked",
  broker_response_received: "Broker response received", broker_follow_up_due: "Broker follow-up due",
  approved: "Review approved", declined: "Review declined", job_failed: "Analysis failed",
};

function traceDetail(event: AuditEvent): string | null {
  if (/^(?:gemini|openai)_model_/.test(event.eventType)) {
    const model = String(event.detail.model ?? "Model");
    if (event.eventType.endsWith("_started")) return model;
    if (event.eventType.endsWith("_completed")) return `${model} · ${(Number(event.detail.durationMs ?? 0) / 1000).toFixed(1)}s`;
    return `${model}${event.detail.errorCode ? ` · HTTP ${event.detail.errorCode}` : " · invalid or empty response"}`;
  }
  if (event.eventType === "model_extraction_started") {
    const providers = Array.isArray(event.detail.providers) ? event.detail.providers.join(" and ") : "Model";
    return `Calling ${providers} for year built and recent loss count.`;
  }
  if (event.eventType === "extraction_completed") {
    const attempts = Array.isArray(event.detail.attempts) ? event.detail.attempts as { source: string; model: string; status: string; durationMs: number; errorCode?: number; attemptCount?: number }[] : [];
    const completed = attempts.filter((attempt) => attempt.status === "completed");
    const failed = attempts.filter((attempt) => attempt.status === "failed");
    const source = completed.length
      ? `${completed.map((attempt) => `${attempt.source} ${attempt.model} (${(attempt.durationMs / 1000).toFixed(1)}s${attempt.attemptCount && attempt.attemptCount > 1 ? `, ${attempt.attemptCount} attempts` : ""})`).join(", ")} with parser cross-check`
      : failed.length ? `${failed.map((attempt) => `${attempt.source}${attempt.errorCode ? ` (HTTP ${attempt.errorCode})` : ""}`).join(" and ")} unavailable; parser fallback` : "Parser only; no model configured";
    const missing = Array.isArray(event.detail.missing) && event.detail.missing.length ? ` · Missing: ${event.detail.missing.join(", ")}` : "";
    const applied = event.detail.appliedSources as { yearBuilt?: string; losses?: string } | undefined;
    const used = applied ? ` · Used: year ${applied.yearBuilt}, losses ${applied.losses}` : "";
    return `${attempts.length ? source : (Array.isArray(event.detail.sources) ? event.detail.sources.join(", ") : "Broker submission")}${used}${missing}`;
  }
  if (event.eventType === "analysis_completed") {
    if (typeof event.detail.pass !== "number") return String(event.detail.status ?? "Analysis complete").replaceAll("_", " ");
    return `Deterministic demo rules · ${event.detail.pass} passed · ${event.detail.refer} referred · ${event.detail.unknown} unknown`;
  }
  if (event.eventType === "public_research_skipped") return String(event.detail.reason ?? "Public research was skipped");
  if (event.eventType === "public_research_completed") {
    const signals = Array.isArray(event.detail.signals) ? event.detail.signals as string[] : [];
    return signals.length ? `Public source saved as evidence · ${signals.length} signal${signals.length === 1 ? "" : "s"}: ${signals.join(", ")}` : "Public source saved as evidence";
  }
  if (event.eventType === "broker_follow_up_due") return "24-hour wait elapsed; no message was sent";
  return null;
}

function AnalysisTrace({ audit, working }: { audit: AuditEvent[]; working: boolean }) {
  return <section className={`analysis-trace${working ? " is-working" : ""}`} aria-label="Activity trace">
    <div className="trace-header"><span><ListChecks size={16} /> Activity trace <small>{audit.length} recorded steps</small></span></div>
    <ol className="trace-list">{audit.map((event) => <li key={event.id}>
      <div className="trace-heading"><strong>{eventLabels[event.eventType] ?? event.eventType.replaceAll("_", " ")}</strong><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div>
      {traceDetail(event) && <p>{traceDetail(event)}</p>}
    </li>)}</ol>
  </section>;
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
        : latest?.eventType === "guideline_check_started" ? "Astra is checking the demo guidelines"
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

const FACT_NAMES: Record<string, string> = { state: "state", tiv: "insured value", yearBuilt: "year built", losses: "loss count" };
const seconds = (ms: unknown) => `${(Number(ms ?? 0) / 1000).toFixed(1)}s`;
const list = (items: unknown[]) => items.map((item) => FACT_NAMES[String(item)] ?? String(item)).join(", ");

/** What the agent is looking for at this stage, so the reader knows what matters before the results land. */
function stageFocus(caseRecord: CaseRecord): string {
  const given = [caseRecord.yearBuilt !== null ? "Year built" : null, caseRecord.losses !== null ? "Loss count" : null].filter((name): name is string => name !== null);
  switch (caseRecord.status) {
    case "received": return "Four facts decide appetite for this risk: state, insured value, year built and loss history. First job is to pin each one down and note where it came from.";
    case "extracting": return given.length === 2
      ? "All four facts were entered on the form. I'm still reading the broker's notes to confirm them and catch anything the notes contradict."
      : `State and insured value came in structured. ${given.length ? `${given[0]} was given too. ` : ""}Year built and loss count are what brokers most often leave out or bury in prose, so that's what I'm reading for.`;
    case "checking": return "Each fact is tested against the demo appetite: territory, the insured-value cap, building age and loss count. A referral means an underwriter should look, not that the risk is declined.";
    default: return "";
  }
}

/** Each audit event, told in the agent's own words: what it did and why that matters for the decision. */
function narrate(event: AuditEvent): { text: string; why?: string } | null {
  const detail = event.detail;
  if (/_model_started$/.test(event.eventType)) return { text: "Taking a second read of the notes" };
  if (/_model_completed$/.test(event.eventType)) return { text: `Second read finished in ${seconds(detail.durationMs)}`, why: "I don't take either read on trust: the two have to agree before a value is used, and where they don't, that becomes a finding." };
  if (/_model_failed$/.test(event.eventType)) return { text: "Second read came back empty", why: "Carrying on with the first read alone. Anything taken from prose will carry lower confidence, and I'll say so." };
  switch (event.eventType) {
    case "case_created": return { text: "Logged the submission", why: "Recorded the broker's notes and the form values as the case's source of truth. Everything below points back to them." };
    case "extraction_started": return { text: "Reading the broker's notes", why: "Looking for the two facts that drive the age and loss-history rules: when the building went up, and how many losses in the last three years." };
    case "model_extraction_started": return { text: "Extracting the broker facts", why: "Two independent reads of the same notes: one catches figures the other misses, and disagreement between them is itself a finding." };
    case "extraction_completed": {
      const missing = Array.isArray(detail.missing) ? detail.missing : [];
      const conflicts = Number(detail.conflicts ?? 0);
      if (missing.length) return { text: `Facts settled, except ${list(missing)}`, why: `The appetite rules can't be applied without ${missing.length > 1 ? "them" : "it"}, so rather than guess I'll pause and ask the broker.` };
      return { text: "All four facts in hand", why: conflicts ? `${conflicts} value${conflicts === 1 ? "" : "s"} came back different from the two readers. That gets flagged as a referral rather than silently resolved.` : "Sources agree. Each value is stored with where it came from and how confident I am in it." };
    }
    case "public_research_started": return { text: "Visiting the public source the broker linked", why: "Looking for construction type, roof condition and neighbouring hazards. Notes rarely mention those, and they change the risk picture." };
    case "public_research_completed": {
      const signals = Array.isArray(detail.signals) ? detail.signals as string[] : [];
      return { text: "Public page saved as evidence", why: signals.length ? `Worth weighing against the submission: ${signals.join(", ")}.` : "Nothing on the page raised a signal. It stays on file as context." };
    }
    case "public_research_skipped": return { text: "No public research this time", why: String(detail.reason ?? "No source was supplied.") };
    case "public_research_failed": return { text: "Public source unreachable", why: "Proceeding on the submission alone and recording the gap in the trace." };
    case "guideline_check_started": return { text: "Checking the demo appetite", why: "Territory, insured-value cap, building age and loss count each come back pass, refer or unknown. Unknowns are questions, not verdicts." };
    case "analysis_completed": {
      const refer = Number(detail.refer ?? 0), pass = Number(detail.pass ?? 0), unknown = Number(detail.unknown ?? 0);
      return { text: `${pass} passed · ${refer} referred · ${unknown} unknown`, why: detail.status === "waiting_for_broker" ? "One answer depends on the broker, so I'm pausing and writing the question." : refer ? "Referrals are the part worth your time. The brief leads with them." : "Nothing needs escalation. Writing the brief for your review." };
    }
    case "broker_response_received": return { text: "Broker replied", why: "Re-reading the notes with the new information. Anything that changed is checked again from scratch." };
    case "broker_follow_up_due": return { text: "Follow-up window elapsed", why: "No message was sent; this is a reminder that the case is still waiting on the broker." };
    case "job_failed": return { text: "Analysis stopped", why: String(detail.reason ?? "Something went wrong. The trace has the detail.") };
    default: return null;
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
  const thoughts = audit.map((event) => ({ id: event.id, thought: narrate(event) })).filter((entry) => entry.thought).slice(-5);
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
      ? <p className="working-focus working-stalled">This case is in the queue and will start automatically as soon as the analysis service is free. Nothing is needed from you; this page keeps checking on its own.</p>
      : <p className="working-focus">{stageFocus(caseRecord)}</p>}
    {thoughts.length > 0 && <ol className="thinking" aria-label="What the agent is doing">
      {thoughts.map((entry, index) => <li key={entry.id} className={index === thoughts.length - 1 ? "is-current" : undefined}>
        <strong>{entry.thought!.text}</strong>
        {entry.thought!.why && <p>{entry.thought!.why}</p>}
      </li>)}
    </ol>}
  </div>;
}


export function CaseView({ id, caseRecord, audit, jobStatus, error, voiceAvailable, response, setResponse, reason, setReason, submitting, onResponse, onDecision }: {
  id: string; caseRecord: CaseRecord; audit: AuditEvent[]; jobStatus: JobStatus; error: string | null; voiceAvailable: boolean;
  response: string; setResponse: (value: string) => void;
  reason: string; setReason: (value: string) => void; submitting: boolean;
  onResponse: () => void; onDecision: (kind: ActionKind) => void;
}) {
  const working = isProcessing(caseRecord, jobStatus);
  useElapsedSeconds(id, working);
  return <main className="shell shell-narrow conversation">
    <div className="case-toolbar">
      <p className="breadcrumb"><Link href="/overview">Commercial property</Link><span className="sep">/</span><Link href="/cases">Cases</Link><span className="sep">/</span><span className="current">{caseRecord.insuredName}</span></p>
      <span className="case-id-label">case {id.slice(0, 8)}</span>
      <Status value={caseRecord.status} />
    </div>
    {error && <div className="alert" role="alert"><WarningCircle size={17} aria-hidden="true" />{error}</div>}
    <div className="conversation-message request-message">
      <div className="message-avatar requester-avatar"><FileText size={16} aria-hidden="true" /></div>
      <div className="message-content"><p className="message-label">Submission</p><h1>{caseRecord.insuredName}</h1><p>{caseRecord.state} property · ${caseRecord.tiv.toLocaleString()} total insured value</p><time dateTime={caseRecord.createdAt}>{new Date(caseRecord.createdAt).toLocaleString()}</time></div>
    </div>
    <div className="conversation-message agent-message">
      <div className={`message-avatar agent-avatar${working ? " is-working" : ""}`}>{working && <span className="ring ring-fast" aria-hidden="true"><i /></span>}{working ? <Mark size={20} /> : <ShieldCheck size={18} weight="duotone" aria-hidden="true" />}</div>
      <div className="message-content">
        <p className="message-label">Underwriting agent{working && <span className="message-live">Working</span>}</p>
        {working ? <AgentWorking caseRecord={caseRecord} audit={audit} jobStatus={jobStatus} /> : <JobProgress caseRecord={caseRecord} audit={audit} jobStatus={jobStatus} />}
        {caseRecord.status === "failed" && <div className="alert"><WarningCircle size={17} aria-hidden="true" />{caseRecord.error ?? "Analysis failed."}</div>}
        {caseRecord.brief ? <p className="brief">{caseRecord.brief}</p> : !working && <p className="brief">Analysis is in progress.</p>}
        {voiceAvailable && caseRecord.brief && <VoiceBrief id={id} />}
        <AnalysisTrace audit={audit} working={working} />
        {caseRecord.facts && <section className="detail-section" aria-labelledby="facts-title"><div className="section-heading"><h2 id="facts-title">Extracted facts</h2><FileText size={16} aria-hidden="true" /></div><div className="fact-list"><FactRow label="State" fact={caseRecord.facts.state} /><FactRow label="Total insured value" fact={caseRecord.facts.tiv} format={(value) => `$${value.toLocaleString()}`} /><FactRow label="Year built" fact={caseRecord.facts.yearBuilt} /><FactRow label="Loss count" fact={caseRecord.facts.losses} /></div></section>}
        <Findings caseRecord={caseRecord} />
        {caseRecord.publicEvidence && <section className="detail-section" aria-labelledby="evidence-title"><div className="section-heading"><h2 id="evidence-title">Public-source evidence</h2><ArrowSquareOut size={16} aria-hidden="true" /></div><p className="brief">{caseRecord.publicEvidence.excerpt}</p><div className="source-line"><a className="text-link" href={caseRecord.publicEvidence.url} target="_blank" rel="noopener noreferrer">{caseRecord.publicEvidence.title || caseRecord.publicEvidence.url}</a><span>External source; verify before relying on it.</span></div></section>}
      </div>
    </div>
    <div className="conversation-action"><CaseActions caseRecord={caseRecord} response={response} setResponse={setResponse} reason={reason} setReason={setReason} submitting={submitting} onResponse={onResponse} onDecision={onDecision} /></div>
    <p className="demo-note">Demo guidelines only. A review decision does not quote or bind coverage.</p>
  </main>;
}
