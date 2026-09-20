"use client";

import { useState, type FormEvent } from "react";
import { Check, EnvelopeSimple, PencilSimple, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { CaseRecord, DraftStatus } from "@/lib/types";

const stateLabels: Record<DraftStatus, string> = {
  pending: "Drafted by the agent · awaiting your approval",
  edited: "Edited · not yet approved",
  approved: "Approved · recorded as sent",
};

/**
 * The agent's email to the broker for this analysis revision. The underwriter can rewrite it and
 * approve it; approval is what "sends" it (an audit event, no real mail). Keyed by revision from
 * the parent so a new draft after a reply starts fresh.
 */
export function BrokerDraft({ caseRecord, onSaved }: { caseRecord: CaseRecord; onSaved: () => void }) {
  const original = caseRecord.draftEmail ?? "";
  const [text, setText] = useState(original);
  const [saving, setSaving] = useState<"approved" | "edited" | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!caseRecord.draftEmail) return null;
  const status: DraftStatus = caseRecord.draftStatus ?? "pending";

  async function save(next: "approved" | "edited") {
    setSaving(next);
    setError(null);
    try {
      const response = await fetch(`/api/cases/${caseRecord.id}/draft`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisRevision: caseRecord.analysisRevision, status: next, text }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save the email.");
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the email.");
    } finally {
      setSaving(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save("approved");
  }

  const unchanged = text.trim() === original.trim();
  return <div className={`broker-draft is-${status}`} role="group" aria-labelledby="broker-draft-title">
    <div className="broker-draft-head">
      <span className="broker-draft-title" id="broker-draft-title"><EnvelopeSimple size={15} aria-hidden="true" />Email to the broker</span>
      <span className="broker-draft-state">{stateLabels[status]}</span>
    </div>
    {status === "approved"
      ? <p className="broker-draft-text">{caseRecord.draftEmail}</p>
      : <form onSubmit={submit}>
        <label>Email text<textarea required minLength={3} maxLength={10000} rows={7} value={text} onChange={(event) => setText(event.target.value)} /></label>
        <div className="decision-actions">
          <button className="primary-button" type="submit" disabled={saving !== null || text.trim().length < 3}><Check size={15} aria-hidden="true" />{saving === "approved" ? "Approving..." : "Approve and send"}</button>
          <button className="secondary-button" type="button" disabled={saving !== null || unchanged || text.trim().length < 3} onClick={() => void save("edited")}><PencilSimple size={15} aria-hidden="true" />{saving === "edited" ? "Saving..." : "Save edits"}</button>
        </div>
      </form>}
    {error && <div className="alert" role="alert"><WarningCircle size={17} aria-hidden="true" />{error}</div>}
    <p className="subtle">Approving records the email in the activity trace as sent; no message leaves this workspace. The broker&apos;s reply goes in the form below.</p>
  </div>;
}
