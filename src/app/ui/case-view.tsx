import type { FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CircleAlert, Clock3, FileText, Send, X } from "lucide-react";
import type { AuditEvent, CaseRecord, Fact } from "@/lib/types";
import { Status } from "./status";

type ActionKind = "approve" | "decline";

function FactRow<T>({ label, fact, format = String }: { label: string; fact: Fact<T>; format?: (value: T) => string }) {
  return <div className="fact-row"><span>{label}</span><strong>{fact.value === null ? "Not provided" : format(fact.value)}</strong><small>{fact.source} · {Math.round(fact.confidence * 100)}% confidence</small></div>;
}

function Findings({ caseRecord }: { caseRecord: CaseRecord }) {
  if (!caseRecord.findings) return null;
  return <section className="detail-section">
    <div className="section-heading"><h2>Guideline checks</h2><span className="count">{caseRecord.findings.length}</span></div>
    <div className="findings">{caseRecord.findings.map((finding) => (
      <div className="finding" key={finding.id}>
        <span className={`finding-mark finding-${finding.result}`}>
          {finding.result === "pass" ? <Check size={16} /> : finding.result === "refer" ? <CircleAlert size={16} /> : <Clock3 size={16} />}
        </span>
        <div><strong>{finding.label}</strong><p>{finding.detail}</p><small>Source: {finding.source}</small></div>
      </div>
    ))}</div>
  </section>;
}

function BrokerAction({ question, response, setResponse, submitting, onSubmit }: {
  question: string | null; response: string; setResponse: (value: string) => void;
  submitting: boolean; onSubmit: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSubmit(); }
  return <section className="action-section">
    <div className="section-heading"><h2>Broker information needed</h2></div>
    <p>{question}</p>
    <form onSubmit={submit}>
      <label>Broker response<textarea required minLength={3} maxLength={10000} rows={4} value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Enter the broker's reply..." /></label>
      <button className="primary-button" disabled={submitting} type="submit"><Send size={16} />{submitting ? "Sending..." : "Add response and resume"}</button>
    </form>
  </section>;
}

function ReviewAction({ reason, setReason, submitting, onDecision }: {
  reason: string; setReason: (value: string) => void; submitting: boolean;
  onDecision: (kind: ActionKind) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onDecision("approve"); }
  return <section className="action-section">
    <div className="section-heading"><h2>Underwriter decision</h2></div>
    <form onSubmit={submit}>
      <label>Review rationale<textarea required minLength={3} maxLength={2000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record the reason for your decision..." /></label>
      <div className="decision-actions">
        <button className="primary-button" disabled={submitting || reason.trim().length < 3} type="submit"><Check size={16} />Approve review</button>
        <button className="secondary-button" disabled={submitting || reason.trim().length < 3} onClick={() => onDecision("decline")} type="button"><X size={16} />Decline</button>
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
  if (caseRecord.status === "approved" || caseRecord.status === "declined") return <section className="detail-section"><h2>Decision rationale</h2><p className="brief">{caseRecord.decision}</p></section>;
  return null;
}

function CaseSidebar({ caseRecord, audit }: { caseRecord: CaseRecord; audit: AuditEvent[] }) {
  return <aside className="detail-aside">
    <section className="aside-section">
      <h2>Extracted facts</h2>
      {caseRecord.facts ? <div className="fact-list">
        <FactRow label="State" fact={caseRecord.facts.state} />
        <FactRow label="Total insured value" fact={caseRecord.facts.tiv} format={(value) => `$${value.toLocaleString()}`} />
        <FactRow label="Year built" fact={caseRecord.facts.yearBuilt} />
        <FactRow label="Loss count" fact={caseRecord.facts.losses} />
      </div> : <p className="subtle">Awaiting extraction.</p>}
    </section>
    <section className="aside-section">
      <h2>Activity</h2>
      <ol className="timeline">{audit.map((event) => <li key={event.id}><span>{event.eventType.replaceAll("_", " ")}</span><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></li>)}</ol>
    </section>
  </aside>;
}

export function CaseView({ id, caseRecord, audit, error, voiceAvailable, response, setResponse, reason, setReason, submitting, onResponse, onDecision }: {
  id: string; caseRecord: CaseRecord; audit: AuditEvent[]; error: string | null; voiceAvailable: boolean;
  response: string; setResponse: (value: string) => void;
  reason: string; setReason: (value: string) => void; submitting: boolean;
  onResponse: () => void; onDecision: (kind: ActionKind) => void;
}) {
  const active = ["received", "extracting", "checking"].includes(caseRecord.status);
  return <main className="shell detail-shell">
    <Link className="back-link" href="/"><ArrowLeft size={17} /> Submission queue</Link>
    <div className="detail-heading">
      <div><p className="eyebrow">Case {id.slice(0, 8)}</p><h1>{caseRecord.insuredName}</h1><p className="subtle">{caseRecord.state} · ${caseRecord.tiv.toLocaleString()} total insured value</p></div>
      <Status value={caseRecord.status} />
    </div>
    {error && <div className="alert" role="alert">{error}</div>}
    {active && <div className="progress-line"><Clock3 size={18} /> The worker is processing this case. This page updates automatically.</div>}
    {caseRecord.status === "failed" && <div className="alert"><CircleAlert size={18} /> {caseRecord.error ?? "The workflow failed."}</div>}
    <div className="detail-grid">
      <div className="detail-primary">
        <section className="detail-section"><div className="section-heading"><h2>Review brief</h2><FileText size={18} /></div><p className="brief">{caseRecord.brief ?? "Analysis is in progress."}</p>{voiceAvailable && caseRecord.brief && <audio className="brief-audio" controls preload="none" src={`/api/cases/${id}/audio`} aria-label="Listen to review brief" />}</section>
        {caseRecord.publicEvidence && <section className="detail-section"><div className="section-heading"><h2>Public-source excerpt</h2></div><p className="brief">{caseRecord.publicEvidence.excerpt}</p><a href={caseRecord.publicEvidence.url} target="_blank" rel="noopener noreferrer">{caseRecord.publicEvidence.title || caseRecord.publicEvidence.url}</a><p className="subtle">External source; verify before relying on it.</p></section>}
        <Findings caseRecord={caseRecord} />
        <CaseActions caseRecord={caseRecord} response={response} setResponse={setResponse} reason={reason} setReason={setReason} submitting={submitting} onResponse={onResponse} onDecision={onDecision} />
      </div>
      <CaseSidebar caseRecord={caseRecord} audit={audit} />
    </div>
    <p className="demo-note">Demo guidelines only. Approval here records a review decision; it does not quote or bind coverage.</p>
  </main>;
}
