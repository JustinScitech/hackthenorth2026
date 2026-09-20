"use client";

import { useState, type FormEvent } from "react";
import { PencilSimple, Plus, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { buildAgentReportSections } from "@/lib/case-report-draft";
import type { AuditEvent, CaseRecord, ReportSection } from "@/lib/types";

export function CaseReportEditor({ caseRecord, audit, working, onSaved }: {
  caseRecord: CaseRecord; audit: AuditEvent[]; working: boolean; onSaved: () => void;
}) {
  const currentDraft = caseRecord.reportDraft?.analysisRevision === caseRecord.analysisRevision ? caseRecord.reportDraft : null;
  const staleDraft = Boolean(caseRecord.reportDraft && !currentDraft);
  const [sections, setSections] = useState<ReportSection[]>(() => currentDraft?.sections ?? buildAgentReportSections(caseRecord, audit));
  const [savedSections, setSavedSections] = useState<ReportSection[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [showPreview, setShowPreview] = useState(Boolean(currentDraft));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(index: number, key: "title" | "body", value: string) {
    setSections((current) => current.map((section, position) => position === index ? { ...section, [key]: value } : section));
  }

  function move(index: number, direction: -1 | 1) {
    setSections((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const result = [...current];
      [result[index], result[target]] = [result[target], result[index]];
      return result;
    });
  }

  async function save(nextSections: ReportSection[]) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/cases/${caseRecord.id}/report`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisRevision: caseRecord.analysisRevision, version: caseRecord.reportDraftVersion ?? 0, sections: nextSections }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save the report.");
      setSavedSections(nextSections.length ? nextSections : null);
      setEditing(false);
      setShowPreview(nextSections.length > 0);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the report.");
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sections.length || sections.some((section) => !section.title.trim())) {
      setError("Add at least one section with a title before saving.");
      return;
    }
    void save(sections);
  }

  function cancel() {
    setSections(currentDraft?.sections ?? buildAgentReportSections(caseRecord, audit));
    setError(null);
    setEditing(false);
  }

  const displayed = currentDraft?.sections ?? savedSections ?? buildAgentReportSections(caseRecord, audit);
  return <section className="report-review card" aria-labelledby="report-review-title">
    <div className="report-review-head">
      <div>
        <p className="eyebrow">Review document</p>
        <h2 id="report-review-title">Editable agent report</h2>
        <p className="subtle">Revise the write-up before sharing it. The original agent analysis remains below for reference.</p>
      </div>
      {!editing && <div className="actions">
        <button className="quiet-button" type="button" onClick={() => setShowPreview((visible) => !visible)}>{showPreview ? "Hide report" : "View report"}</button>
        <button className="secondary-button" type="button" onClick={() => { setSections(currentDraft?.sections ?? buildAgentReportSections(caseRecord, audit)); setEditing(true); }} disabled={working}><PencilSimple size={15} aria-hidden="true" />Edit report</button>
      </div>}
    </div>
    {currentDraft && <p className="report-review-meta">Reviewer-edited version saved by {currentDraft.editedBy} on {new Date(currentDraft.updatedAt).toLocaleString()}. PDF exports use this version.</p>}
    {staleDraft && <p className="notice">The agent has run again since the last edit. PDF exports use the latest agent output until you review and save a new draft.</p>}
    {working && <p className="subtle">Editing opens when the agent finishes this analysis.</p>}
    {error && <div className="alert" role="alert"><WarningCircle size={17} aria-hidden="true" />{error}</div>}

    {editing ? <form className="report-editor" onSubmit={submit}>
      <p className="subtle">Each section becomes part of the exported PDF. You can rewrite, reorder, add, or remove sections.</p>
      {sections.map((section, index) => <div className="report-section-editor" key={section.id}>
        <div className="report-section-controls"><strong>Section {index + 1}</strong><div className="actions">
          <button className="quiet-button" type="button" onClick={() => move(index, -1)} disabled={index === 0}>Move up</button>
          <button className="quiet-button" type="button" onClick={() => move(index, 1)} disabled={index === sections.length - 1}>Move down</button>
          <button className="quiet-button" type="button" onClick={() => setSections((current) => current.filter((part) => part.id !== section.id))}>Remove</button>
        </div></div>
        <label>Section title<input value={section.title} maxLength={120} required onChange={(event) => update(index, "title", event.target.value)} /></label>
        <label>Section text<textarea value={section.body} maxLength={30_000} rows={Math.min(12, Math.max(5, section.body.split("\n").length + 1))} onChange={(event) => update(index, "body", event.target.value)} /></label>
      </div>)}
      <button className="quiet-button" type="button" onClick={() => setSections((current) => [...current, { id: crypto.randomUUID(), title: "New section", body: "" }])} disabled={sections.length >= 30}><Plus size={15} aria-hidden="true" />Add section</button>
      <div className="report-editor-actions">
        <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save edited report"}</button>
        <button className="secondary-button" type="button" onClick={cancel} disabled={saving}>Cancel</button>
        <button className="quiet-button" type="button" onClick={() => setSections(buildAgentReportSections(caseRecord, audit))} disabled={saving}>Start from latest agent output</button>
        {currentDraft && <button className="quiet-button" type="button" onClick={() => void save([])} disabled={saving}>Restore original report</button>}
      </div>
    </form> : showPreview && <div className="report-preview">
      {displayed.map((section) => <section key={section.id}><h3>{section.title}</h3><p>{section.body}</p></section>)}
    </div>}
  </section>;
}
