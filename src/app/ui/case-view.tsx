import type { FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CircleAlert, Clock3, ExternalLink, FileText, Send, X } from "lucide-react";
import type { AuditEvent, CaseRecord, Fact } from "@/lib/types";
import { Status } from "./status";

type ActionKind = "approve" | "decline";

function FactRow<T>({ label, fact, format = String }: { label: string; fact: Fact<T>; format?: (value: T) => string }) {
  return <div className="fact-row"><span>{label}</span><strong>{fact.value === null ? "Not provided" : format(fact.value)}</strong><small>{fact.source} · {Math.round(fact.confidence * 100)}% confidence</small></div>;
}

function Findings({ caseRecord }: { caseRecord: CaseRecord }) {
  if (!caseRecord.findings) return null;
  return <section className="detail-section" aria-labelledby="findings-title">
    <div className="section-heading"><h2 id="findings-title">Guideline checks</h2><span className="count">{caseRecord.findings.length}</span></div>
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

function CaseSidebar({ caseRecord, audit }: { caseRecord: CaseRecord; audit: AuditEvent[] }) {
  return <aside className="detail-aside">
    <section className="aside-section" aria-labelledby="facts-title">
      <h2 id="facts-title">Extracted facts</h2>
      {caseRecord.facts ? <div className="fact-list">
        <FactRow label="State" fact={caseRecord.facts.state} />
        <FactRow label="Total insured value" fact={caseRecord.facts.tiv} format={(value) => `$${value.toLocaleString()}`} />
        <FactRow label="Year built" fact={caseRecord.facts.yearBuilt} />
        <FactRow label="Loss count" fact={caseRecord.facts.losses} />
      </div> : <p className="subtle">Awaiting extraction.</p>}
    </section>
    <section className="aside-section" aria-labelledby="activity-title">
      <h2 id="activity-title">Activity</h2>
      {audit.length === 0 ? <p className="subtle">No activity recorded yet.</p> : <ol className="timeline">{audit.map((event) => <li key={event.id}><span>{event.eventType.replaceAll("_", " ")}</span><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></li>)}</ol>}
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
    <Link className="back-link" href="/"><ArrowLeft size={15} /> Submission queue</Link>
    <div className="detail-heading">
      <div><p className="eyebrow">Case <code>{id.slice(0, 8)}</code></p><h1>{caseRecord.insuredName}</h1><p className="subtle">{caseRecord.state} · ${caseRecord.tiv.toLocaleString()} total insured value</p></div>
      <Status value={caseRecord.status} />
    </div>
    {error && <div className="alert" role="alert"><CircleAlert size={17} aria-hidden="true" />{error}</div>}
    {active && <div className="progress-line" role="status"><Clock3 size={16} aria-hidden="true" /> The worker is processing this case. This page updates automatically.</div>}
    {caseRecord.status === "failed" && <div className="alert"><CircleAlert size={17} aria-hidden="true" /> {caseRecord.error ?? "The workflow failed."}</div>}
    <div className="detail-grid">
      <div className="detail-primary">
        <section className="detail-section" aria-labelledby="brief-title">
          <div className="section-heading"><h2 id="brief-title">Review brief</h2><FileText size={16} aria-hidden="true" /></div>
          <p className="brief">{caseRecord.brief ?? "Analysis is in progress."}</p>
          {voiceAvailable && caseRecord.brief && <audio className="brief-audio" controls preload="none" src={`/api/cases/${id}/audio`} aria-label="Listen to review brief" />}
        </section>
        {caseRecord.publicEvidence && <section className="detail-section" aria-labelledby="evidence-title">
          <div className="section-heading"><h2 id="evidence-title">Public-source excerpt</h2><ExternalLink size={16} aria-hidden="true" /></div>
          <p className="brief">{caseRecord.publicEvidence.excerpt}</p>
          <div className="source-line"><a className="text-link" href={caseRecord.publicEvidence.url} target="_blank" rel="noopener noreferrer">{caseRecord.publicEvidence.title || caseRecord.publicEvidence.url}</a><span>External source; verify before relying on it.</span></div>
        </section>}
        <Findings caseRecord={caseRecord} />
        <CaseActions caseRecord={caseRecord} response={response} setResponse={setResponse} reason={reason} setReason={setReason} submitting={submitting} onResponse={onResponse} onDecision={onDecision} />
      </div>
      <CaseSidebar caseRecord={caseRecord} audit={audit} />
    </div>
    <p className="demo-note">Demo guidelines only. Approval here records a review decision; it does not quote or bind coverage.</p>
  </main>;
}
