"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleAlert, FilePlus2 } from "lucide-react";

type FormState = { insuredName: string; state: string; tiv: string; yearBuilt: string; losses: string; brokerNotes: string; publicSourceUrl: string };
const emptyForm: FormState = { insuredName: "", state: "", tiv: "", yearBuilt: "", losses: "", brokerNotes: "", publicSourceUrl: "" };
const sampleForm: FormState = {
  insuredName: "Front Range Fabrication", state: "CO", tiv: "3200000", yearBuilt: "2008", losses: "0",
  brokerNotes: "Commercial property submission for Front Range Fabrication in Colorado. The building was constructed in 2008, is owner occupied and sprinklered, and had no losses in the past three years.",
  publicSourceUrl: "",
};

export function IntakeForm({ prefillSample = false }: { prefillSample?: boolean }) {
  const [form, setForm] = useState<FormState>(prefillSample ? sampleForm : emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          publicSourceUrl: form.publicSourceUrl.trim() || null,
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
    <main className="shell shell-narrow">
      <p className="breadcrumb"><Link href="/overview">Commercial property</Link><span className="sep">/</span><Link href="/cases">Cases</Link><span className="sep">/</span><span className="current">New submission</span></p>
      <div className="page-title-row">
        <div><h1 className="page-title">New submission</h1><p className="subtle" style={{ marginTop: 6 }}>Start a durable review. The agent extracts facts, checks demo guidelines, and pauses for the broker when information is missing.</p></div>
        <div className="actions"><button className="secondary-button" type="button" onClick={() => setForm(sampleForm)}>Load Colorado sample</button></div>
      </div>
      {error && <div className="alert" role="alert"><CircleAlert size={17} aria-hidden="true" />{error}</div>}
      <form className="card" onSubmit={createCase}>
        <div className="form-section">
          <div className="form-section-title"><h2>Insured</h2><p>Who and what is being covered.</p></div>
          <label>Insured name<input required maxLength={160} value={form.insuredName} onChange={(event) => update("insuredName", event.target.value)} placeholder="Business name" /></label>
          <div className="field-pair">
            <label>State<input required maxLength={2} value={form.state} onChange={(event) => update("state", event.target.value.toUpperCase())} placeholder="CO" /></label>
            <label>Total insured value<input required min="1" type="number" value={form.tiv} onChange={(event) => update("tiv", event.target.value)} placeholder="3200000" /></label>
          </div>
          <div className="field-pair">
            <label>Year built <span className="optional">Optional</span><input min="1800" max={new Date().getFullYear()} type="number" value={form.yearBuilt} onChange={(event) => update("yearBuilt", event.target.value)} placeholder="2008" /></label>
            <label>Loss count <span className="optional">Optional</span><input min="0" type="number" value={form.losses} onChange={(event) => update("losses", event.target.value)} placeholder="0" /></label>
          </div>
        </div>
        <div className="form-section">
          <div className="form-section-title"><h2>Broker submission</h2><p>Paste the broker's notes. Unstructured text is fine; the agent extracts what it can and asks for the rest.</p></div>
          <label>Submission text<textarea required minLength={10} maxLength={20000} rows={8} value={form.brokerNotes} onChange={(event) => update("brokerNotes", event.target.value)} placeholder="Paste the broker's submission details here..." /></label>
          <label>Public source URL <span className="optional">Optional</span><input type="url" maxLength={2000} value={form.publicSourceUrl} onChange={(event) => update("publicSourceUrl", event.target.value)} placeholder="https://example.com/property" /></label>
        </div>
        <div className="form-footer">
          <span className="subtle">Fictional demo rules. A final decision requires underwriter review.</span>
          <button className="primary-button" disabled={submitting} type="submit"><FilePlus2 size={16} />{submitting ? "Starting case..." : "Start analysis"}</button>
        </div>
      </form>
    </main>
  );
}
