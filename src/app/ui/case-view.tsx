import type { FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, CircleAlert, ClipboardList, Clock3, FilePlus2, FileText, ShieldCheck, Send, X } from "lucide-react";
import type { AuditEvent, CaseRecord, Fact } from "@/lib/types";
import { Status } from "./status";

type ActionKind = "approve" | "decline";

function FactRow<T>({ label, fact, format = String }: { label: string; fact: Fact<T>; format?: (value: T) => string }) {
  return <div className="fact-row"><span>{label}</span><strong>{fact.value === null ? "Not provided" : format(fact.value)}</strong><small>{fact.source} · {Math.round(fact.confidence * 100)}% confidence</small></div>;
}

function Findings({ caseRecord }: { caseRecord: CaseRecord }) {
  if (!caseRecord.findings) return null;
  return <section className="detail-section">
    <div className="section-heading"><h2>Demo guideline checks</h2><span className="count">{caseRecord.findings.length}</span></div>
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
  case_created: "Submission received", extraction_completed: "Facts extracted",
  public_research_skipped: "Public research skipped", public_research_completed: "Public source reviewed",
  public_research_failed: "Public research unavailable", analysis_completed: "Guidelines checked",
  broker_response_received: "Broker response received", broker_follow_up_due: "Broker follow-up due",
  approved: "Review approved", declined: "Review declined", workflow_failed: "Workflow failed",
};

function traceDetail(event: AuditEvent): string | null {
  if (event.eventType === "extraction_completed") {
    const sources = Array.isArray(event.detail.sources) ? event.detail.sources.join(", ") : "Broker submission";
    const missing = Array.isArray(event.detail.missing) && event.detail.missing.length ? ` · Missing: ${event.detail.missing.join(", ")}` : "";
    return `${sources}${missing}`;
  }
  if (event.eventType === "analysis_completed") {
    if (typeof event.detail.pass !== "number") return String(event.detail.status ?? "Analysis complete").replaceAll("_", " ");
    return `${event.detail.pass} passed · ${event.detail.refer} referred · ${event.detail.unknown} unknown`;
  }
  if (event.eventType === "public_research_skipped") return "Browserbase is not configured";
  if (event.eventType === "public_research_completed") return "Public source saved as evidence";
  if (event.eventType === "broker_follow_up_due") return "24-hour wait elapsed; no message was sent";
  return null;
}

function AnalysisTrace({ audit }: { audit: AuditEvent[] }) {
  return <details className="analysis-trace">
    <summary><span><ClipboardList size={16} /> Activity trace <small>{audit.length} recorded steps</small></span><ChevronDown size={16} aria-hidden="true" /></summary>
    <ol className="trace-list">{audit.map((event) => <li key={event.id}>
      <div className="trace-heading"><strong>{eventLabels[event.eventType] ?? event.eventType.replaceAll("_", " ")}</strong><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div>
      {traceDetail(event) && <p>{traceDetail(event)}</p>}
    </li>)}</ol>
  </details>;
}

export function CaseView({ id, caseRecord, audit, history, error, voiceAvailable, response, setResponse, reason, setReason, submitting, onResponse, onDecision }: {
  id: string; caseRecord: CaseRecord; audit: AuditEvent[]; history: CaseRecord[]; error: string | null; voiceAvailable: boolean;
  response: string; setResponse: (value: string) => void;
  reason: string; setReason: (value: string) => void; submitting: boolean;
  onResponse: () => void; onDecision: (kind: ActionKind) => void;
}) {
  const active = ["received", "extracting", "checking"].includes(caseRecord.status);
  return <main className="case-workspace">
    <aside className="case-navigation" aria-label="Case navigation">
      <Link className="new-case-link" href="/"><FilePlus2 size={17} /> New submission</Link>
      <p className="nav-caption">Recent cases</p>
      <nav className="case-history">{history.map((item) => <Link key={item.id} href={`/cases/${item.id}`} aria-current={item.id === id ? "page" : undefined} className={item.id === id ? "selected" : ""}><span>{item.insuredName}</span><small>{item.state} · {item.status.replaceAll("_", " ")}</small></Link>)}</nav>
      <Link className="nav-footer-link" href="/triage"><ClipboardList size={16} /> Federato triage</Link>
    </aside>
    <div className="case-main-area">
      <div className="case-toolbar"><Link href="/" className="back-link"><ArrowLeft size={16} /> Queue</Link><span className="case-id-label">Case {id.slice(0, 8)}</span><Status value={caseRecord.status} /></div>
      <div className="conversation">
        {error && <div className="alert" role="alert">{error}</div>}
        <div className="conversation-message request-message"><div className="message-avatar requester-avatar"><FileText size={16} aria-hidden="true" /></div><div className="message-content"><p className="message-label">Submission</p><h1>{caseRecord.insuredName}</h1><p>{caseRecord.state} property · ${caseRecord.tiv.toLocaleString()} total insured value</p><time dateTime={caseRecord.createdAt}>{new Date(caseRecord.createdAt).toLocaleString()}</time></div></div>
        <div className="conversation-message agent-message"><div className="message-avatar agent-avatar"><ShieldCheck size={20} /></div><div className="message-content">
          <p className="message-label">Underwriting agent</p>
          {active && <p className="progress-line"><Clock3 size={17} /> {caseRecord.status === "received" ? "Queued for analysis" : caseRecord.status === "extracting" ? "Extracting submission facts" : "Checking guidelines"}</p>}
          {caseRecord.status === "failed" && <div className="alert"><CircleAlert size={18} /> {caseRecord.error ?? "The workflow failed."}</div>}
          <p className="brief">{caseRecord.brief ?? "Analysis is in progress."}</p>
          {voiceAvailable && caseRecord.brief && <audio className="brief-audio" controls preload="none" src={`/api/cases/${id}/audio`} aria-label="Listen to review brief" />}
          <AnalysisTrace audit={audit} />
          {caseRecord.facts && <section className="detail-section"><div className="section-heading"><h2>Extracted facts</h2><FileText size={17} /></div><div className="fact-list"><FactRow label="State" fact={caseRecord.facts.state} /><FactRow label="Total insured value" fact={caseRecord.facts.tiv} format={(value) => `$${value.toLocaleString()}`} /><FactRow label="Year built" fact={caseRecord.facts.yearBuilt} /><FactRow label="Loss count" fact={caseRecord.facts.losses} /></div></section>}
          <Findings caseRecord={caseRecord} />
          {caseRecord.publicEvidence && <section className="detail-section"><div className="section-heading"><h2>Public-source evidence</h2></div><p className="brief">{caseRecord.publicEvidence.excerpt}</p><a href={caseRecord.publicEvidence.url} target="_blank" rel="noopener noreferrer">{caseRecord.publicEvidence.title || caseRecord.publicEvidence.url}</a><p className="subtle">External source; verify before relying on it.</p></section>}
        </div></div>
        <div className="conversation-action"><CaseActions caseRecord={caseRecord} response={response} setResponse={setResponse} reason={reason} setReason={setReason} submitting={submitting} onResponse={onResponse} onDecision={onDecision} /></div>
        <p className="demo-note">Demo guidelines only. A review decision does not quote or bind coverage.</p>
      </div>
    </div>
  </main>;
}
