"use client";

import { useState, type FormEvent } from "react";
import { ArrowSquareOut, MagnifyingGlass, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { CaseRecord, SourceCandidate } from "@/lib/types";

/** Whether the underwriter can still choose the public source: nothing on file, and the agent is not mid-run. */
export function canPickSource(caseRecord: Pick<CaseRecord, "publicSourceUrl" | "status">): boolean {
  return !caseRecord.publicSourceUrl && ["waiting_for_broker", "review_ready"].includes(caseRecord.status);
}

const host = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };

/**
 * The picker for a case that arrived without a source URL: the ranked pages
 * discovery found, each with why it was offered, plus a field for a page the
 * underwriter knows. Confirming records the URL and queues the research.
 */
export function SourcePicker({ id, caseRecord, onConfirmed }: { id: string; caseRecord: CaseRecord; onConfirmed: () => void }) {
  const candidates: SourceCandidate[] = caseRecord.sourceCandidates ?? [];
  const [choice, setChoice] = useState<string>(candidates[0]?.url ?? "");
  const [manual, setManual] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canPickSource(caseRecord)) return null;
  const url = choice || manual.trim();
  const searched = caseRecord.sourceCandidates !== null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await fetch(`/api/cases/${id}/source`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const payload = await result.json().catch(() => ({}));
      if (!result.ok) throw new Error(payload.error ?? "Could not confirm the source.");
      onConfirmed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not confirm the source.");
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="detail-section source-picker" aria-labelledby="source-picker-title">
    <div className="section-heading"><h2 id="source-picker-title">Public source to research</h2><MagnifyingGlass size={16} aria-hidden="true" /></div>
    <p className="subtle">
      {!searched ? "No source URL came with the submission and no search was run. Enter the assessor or property-record page to fetch."
        : candidates.length ? "No source URL came with the submission, so Astra searched for the county assessor record. Confirm the page to fetch, or enter another."
          : "No source URL came with the submission, and the search found no likely record. Enter the assessor or property-record page to fetch."}
    </p>
    <form onSubmit={submit}>
      {candidates.length > 0 && <fieldset className="candidate-list">
        <legend className="visually-hidden">Discovered pages</legend>
        {candidates.map((candidate) => <label key={candidate.url} className={`candidate${choice === candidate.url ? " is-selected" : ""}`}>
          <input type="radio" name="source" value={candidate.url} checked={choice === candidate.url} onChange={() => setChoice(candidate.url)} />
          <span className="candidate-body">
            <strong>{candidate.title}</strong>
            <span className="candidate-host">{host(candidate.url)}</span>
            {candidate.snippet && <span className="candidate-snippet">{candidate.snippet}</span>}
            <span className="candidate-reason">{candidate.reason}</span>
          </span>
          <span className="candidate-confidence"><b>{candidate.confidence.toFixed(2)}</b><small>confidence</small></span>
        </label>)}
        <label className={`candidate is-manual${choice === "" ? " is-selected" : ""}`}>
          <input type="radio" name="source" value="" checked={choice === ""} onChange={() => setChoice("")} />
          <span className="candidate-body"><strong>Another page</strong><span className="candidate-snippet">A public HTTPS URL you already know for this property.</span></span>
        </label>
      </fieldset>}
      {choice === "" && <label>Source URL<input type="url" inputMode="url" required maxLength={2000} value={manual} onChange={(event) => setManual(event.target.value)} placeholder="https://assessor.example.gov/parcel/..." /></label>}
      {error && <div className="alert" role="alert"><WarningCircle size={17} aria-hidden="true" />{error}</div>}
      <div className="source-picker-actions">
        <button className="primary-button" type="submit" disabled={submitting || !url}><MagnifyingGlass size={15} />{submitting ? "Confirming..." : "Confirm and research"}</button>
        {url && <a className="text-link" href={url} target="_blank" rel="noopener noreferrer"><ArrowSquareOut size={13} aria-hidden="true" /> Open the page first</a>}
        <span className="subtle">The page is fetched by the browser and read for year built, construction, size, use, sprinklers, and flood zone.</span>
      </div>
    </form>
  </section>;
}
