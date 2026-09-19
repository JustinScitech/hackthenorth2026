"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, FilePlus2, RotateCw } from "lucide-react";
import type { CaseRecord } from "@/lib/types";
import { Status } from "./status";

type FormState = { insuredName: string; state: string; tiv: string; yearBuilt: string; losses: string; brokerNotes: string };
const emptyForm: FormState = { insuredName: "", state: "", tiv: "", yearBuilt: "", losses: "", brokerNotes: "" };
const sampleForm: FormState = {
  insuredName: "Harbor Point Works", state: "PA", tiv: "3200000", yearBuilt: "", losses: "",
  brokerNotes: "Commercial property submission for Harbor Point Works. The building was constructed in 1998. Property is owner occupied. Please review for coverage. Loss information will follow from the broker.",
};

export function Dashboard() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/cases", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load cases.");
      setCases(data.cases);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load cases.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  function update(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function createCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/cases", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insuredName: form.insuredName, state: form.state, tiv: Number(form.tiv),
          yearBuilt: form.yearBuilt ? Number(form.yearBuilt) : null,
          losses: form.losses ? Number(form.losses) : null, brokerNotes: form.brokerNotes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create case.");
      window.location.assign(`/cases/${data.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create case.");
      setSubmitting(false);
    }
  }

  return (
    <main className="shell dashboard">
      <div className="page-heading">
        <div><p className="eyebrow">Workspace</p><h1>Submission queue</h1><p className="subtle">Review active commercial property cases and start a new analysis.</p></div>
        <button className="icon-button" type="button" onClick={() => void refresh()} aria-label="Refresh cases" title="Refresh cases"><RotateCw size={18} /></button>
      </div>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="dashboard-grid">
        <section className="queue-section" aria-labelledby="queue-title">
          <div className="section-heading"><h2 id="queue-title">Cases</h2><span className="count">{cases.length}</span></div>
          {loading ? <p className="empty-state">Loading cases...</p> : cases.length === 0 ? <p className="empty-state">No submissions yet. Create a case to begin.</p> : (
            <div className="case-list">
              {cases.map((caseRecord) => (
                <Link className="case-row" href={`/cases/${caseRecord.id}`} key={caseRecord.id}>
                  <div className="case-main"><strong>{caseRecord.insuredName}</strong><span>{caseRecord.state} · ${caseRecord.tiv.toLocaleString()} TIV</span></div>
                  <Status value={caseRecord.status} />
                  <time dateTime={caseRecord.createdAt}>{new Date(caseRecord.createdAt).toLocaleDateString()}</time>
                  <ArrowRight className="row-arrow" size={17} aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="intake-section" aria-labelledby="intake-title">
          <div className="section-heading"><h2 id="intake-title">New submission</h2><button className="quiet-button" type="button" onClick={() => setForm(sampleForm)}>Load sample</button></div>
          <form className="intake-form" onSubmit={createCase}>
            <label>Insured name<input required maxLength={160} value={form.insuredName} onChange={(event) => update("insuredName", event.target.value)} placeholder="Business name" /></label>
            <div className="field-pair">
              <label>State<input required maxLength={2} value={form.state} onChange={(event) => update("state", event.target.value.toUpperCase())} placeholder="PA" /></label>
              <label>Total insured value<input required min="1" type="number" value={form.tiv} onChange={(event) => update("tiv", event.target.value)} placeholder="3200000" /></label>
            </div>
            <div className="field-pair">
              <label>Year built <span className="optional">Optional</span><input min="1800" max={new Date().getFullYear()} type="number" value={form.yearBuilt} onChange={(event) => update("yearBuilt", event.target.value)} placeholder="1998" /></label>
              <label>Loss count <span className="optional">Optional</span><input min="0" type="number" value={form.losses} onChange={(event) => update("losses", event.target.value)} placeholder="0" /></label>
            </div>
            <label>Broker submission<textarea required minLength={10} maxLength={20000} rows={7} value={form.brokerNotes} onChange={(event) => update("brokerNotes", event.target.value)} placeholder="Paste the broker's submission details here..." /></label>
            <button className="primary-button" disabled={submitting} type="submit"><FilePlus2 size={17} />{submitting ? "Starting case..." : "Start analysis"}</button>
          </form>
        </section>
      </div>
      <p className="demo-note">Fictional guideline rules for demonstration only. Every final decision requires underwriter review.</p>
    </main>
  );
}
