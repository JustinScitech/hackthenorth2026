import type { FormEvent } from "react";
import Link from "next/link";
import { Check, CircleAlert, ClipboardList, Clock3, ExternalLink, FileText, ShieldCheck, Send, X } from "lucide-react";
import type { AuditEvent, CaseRecord, Fact, WorkflowStatus } from "@/lib/types";
import { Status } from "./status";

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
          {finding.result === "pass" ? <Check size={15} /> : finding.result === "refer" ? <CircleAlert size={15} /> : <Clock3 size={15} />}
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
    <div className="section-heading"><h2 id="broker-title">Broker information needed</h2><Send size={16} aria-hidden="true" /></div>
    <p>{question}</p>
    <form onSubmit={submit}>
      <label>Broker response<textarea required minLength={3} maxLength={10000} rows={4} value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Enter the broker's reply..." /></label>
      <button className="primary-button" disabled={submitting} type="submit"><Send size={15} />{submitting ? "Sending..." : "Add response and resume"}</button>
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
  public_research_started: "Public source visit started",
  public_research_skipped: "Public research skipped", public_research_completed: "Public source reviewed",
  public_research_failed: "Public research unavailable", guideline_check_started: "Checking demo guidelines",
  analysis_completed: "Guidelines checked",
  broker_response_received: "Broker response received", broker_follow_up_due: "Broker follow-up due",
  approved: "Review approved", declined: "Review declined", workflow_failed: "Workflow failed",
};

function traceDetail(event: AuditEvent): string | null {
  if (event.eventType.startsWith("gemini_model_")) {
    const model = String(event.detail.model ?? "Gemini");
    if (event.eventType === "gemini_model_started") return model;
    if (event.eventType === "gemini_model_completed") return `${model} · ${(Number(event.detail.durationMs ?? 0) / 1000).toFixed(1)}s`;
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
  if (event.eventType === "public_research_completed") return "Public source saved as evidence";
  if (event.eventType === "broker_follow_up_due") return "24-hour wait elapsed; no message was sent";
  return null;
}

function AnalysisTrace({ audit }: { audit: AuditEvent[] }) {
  return <section className="analysis-trace" aria-label="Activity trace">
    <div className="trace-header"><span><ClipboardList size={16} /> Activity trace <small>{audit.length} recorded steps</small></span></div>
    <ol className="trace-list">{audit.map((event) => <li key={event.id}>
      <div className="trace-heading"><strong>{eventLabels[event.eventType] ?? event.eventType.replaceAll("_", " ")}</strong><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div>
      {traceDetail(event) && <p>{traceDetail(event)}</p>}
    </li>)}</ol>
  </section>;
}

function workflowMessage(caseRecord: CaseRecord, audit: AuditEvent[], workflowStatus: WorkflowStatus): string {
  const latest = audit.at(-1);
  const processing = ["received", "extracting", "checking"].includes(caseRecord.status);
  if (workflowStatus === "UNAVAILABLE") return "Temporal status unavailable. Showing the last recorded case step.";
  if (["FAILED", "TERMINATED", "TIMED_OUT"].includes(workflowStatus)) return `Temporal workflow ${workflowStatus.toLowerCase()}.`;
  if (processing && workflowStatus === "RUNNING") {
    const providers = Array.isArray(latest?.detail.providers) ? latest.detail.providers.join(" and ") : "Model";
    return latest?.eventType === "model_extraction_started" ? `${providers} extracting broker facts`
      : latest?.eventType === "gemini_model_started" ? `Extracting with ${String(latest.detail.model ?? "Gemini")}`
        : latest?.eventType === "gemini_model_failed" ? `${String(latest.detail.model ?? "Gemini")} unavailable; continuing extraction`
      : latest?.eventType === "public_research_started" ? "Reviewing the supplied public source"
        : latest?.eventType === "guideline_check_started" ? "Checking demo guidelines"
          : caseRecord.status === "received" ? "Temporal workflow queued" : "Reading the submission";
  }
  if (caseRecord.status === "waiting_for_broker") return "Temporal workflow paused for broker information.";
  if (caseRecord.status === "review_ready") return "Analysis complete. Temporal is waiting for an underwriter decision.";
  if (workflowStatus === "COMPLETED") return "Temporal workflow completed.";
  return `Temporal workflow ${workflowStatus.toLowerCase()}.`;
}

function WorkflowProgress({ caseRecord, audit, workflowStatus }: { caseRecord: CaseRecord; audit: AuditEvent[]; workflowStatus: WorkflowStatus }) {
  return <div className="progress-line" role="status"><Clock3 size={16} aria-hidden="true" />{workflowMessage(caseRecord, audit, workflowStatus)}</div>;
}

export function CaseView({ id, caseRecord, audit, workflowStatus, error, voiceAvailable, response, setResponse, reason, setReason, submitting, onResponse, onDecision }: {
  id: string; caseRecord: CaseRecord; audit: AuditEvent[]; workflowStatus: WorkflowStatus; error: string | null; voiceAvailable: boolean;
  response: string; setResponse: (value: string) => void;
  reason: string; setReason: (value: string) => void; submitting: boolean;
  onResponse: () => void; onDecision: (kind: ActionKind) => void;
}) {
  return <main className="shell shell-narrow conversation">
    <div className="case-toolbar">
      <p className="breadcrumb"><Link href="/overview">Commercial property</Link><span className="sep">/</span><Link href="/cases">Cases</Link><span className="sep">/</span><span className="current">{caseRecord.insuredName}</span></p>
      <span className="case-id-label">case {id.slice(0, 8)}</span>
      <Status value={caseRecord.status} />
    </div>
    {error && <div className="alert" role="alert"><CircleAlert size={17} aria-hidden="true" />{error}</div>}
    <div className="conversation-message request-message">
      <div className="message-avatar requester-avatar"><FileText size={16} aria-hidden="true" /></div>
      <div className="message-content"><p className="message-label">Submission</p><h1>{caseRecord.insuredName}</h1><p>{caseRecord.state} property · ${caseRecord.tiv.toLocaleString()} total insured value</p><time dateTime={caseRecord.createdAt}>{new Date(caseRecord.createdAt).toLocaleString()}</time></div>
    </div>
    <div className="conversation-message agent-message">
      <div className="message-avatar agent-avatar"><ShieldCheck size={18} aria-hidden="true" /></div>
      <div className="message-content">
        <p className="message-label">Underwriting agent</p>
        <WorkflowProgress caseRecord={caseRecord} audit={audit} workflowStatus={workflowStatus} />
        {caseRecord.status === "failed" && <div className="alert"><CircleAlert size={17} aria-hidden="true" />{caseRecord.error ?? "The workflow failed."}</div>}
        <p className="brief">{caseRecord.brief ?? "Analysis is in progress."}</p>
        {voiceAvailable && caseRecord.brief && <audio className="brief-audio" controls preload="none" src={`/api/cases/${id}/audio`} aria-label="Listen to review brief" />}
        <AnalysisTrace audit={audit} />
        {caseRecord.facts && <section className="detail-section" aria-labelledby="facts-title"><div className="section-heading"><h2 id="facts-title">Extracted facts</h2><FileText size={16} aria-hidden="true" /></div><div className="fact-list"><FactRow label="State" fact={caseRecord.facts.state} /><FactRow label="Total insured value" fact={caseRecord.facts.tiv} format={(value) => `$${value.toLocaleString()}`} /><FactRow label="Year built" fact={caseRecord.facts.yearBuilt} /><FactRow label="Loss count" fact={caseRecord.facts.losses} /></div></section>}
        <Findings caseRecord={caseRecord} />
        {caseRecord.publicEvidence && <section className="detail-section" aria-labelledby="evidence-title"><div className="section-heading"><h2 id="evidence-title">Public-source evidence</h2><ExternalLink size={16} aria-hidden="true" /></div><p className="brief">{caseRecord.publicEvidence.excerpt}</p><div className="source-line"><a className="text-link" href={caseRecord.publicEvidence.url} target="_blank" rel="noopener noreferrer">{caseRecord.publicEvidence.title || caseRecord.publicEvidence.url}</a><span>External source; verify before relying on it.</span></div></section>}
      </div>
    </div>
    <div className="conversation-action"><CaseActions caseRecord={caseRecord} response={response} setResponse={setResponse} reason={reason} setReason={setReason} submitting={submitting} onResponse={onResponse} onDecision={onDecision} /></div>
    <p className="demo-note">Demo guidelines only. A review decision does not quote or bind coverage.</p>
  </main>;
}
