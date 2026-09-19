"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleAlert, FilePlus2 } from "lucide-react";

type FormState = { insuredName: string; state: string; tiv: string; yearBuilt: string; losses: string; brokerNotes: string; publicSourceUrl: string };
const emptyForm: FormState = { insuredName: "", state: "", tiv: "", yearBuilt: "", losses: "", brokerNotes: "", publicSourceUrl: "" };
const sampleCases: { id: string; label: string; form: FormState }[] = [
  {
    id: "clean", label: "New York office - clean review",
    form: {
      insuredName: "Hudson Square Offices", state: "NY", tiv: "2400000", yearBuilt: "2012", losses: "0",
      brokerNotes: "Commercial property submission for Hudson Square Offices in New York. The office building was constructed in 2012, is fully sprinklered, and has had no losses in the past three years.",
      publicSourceUrl: "",
    },
  },
  {
    id: "colorado", label: "Colorado fabrication - territory referral",
    form: {
      insuredName: "Front Range Fabrication", state: "CO", tiv: "3200000", yearBuilt: "2008", losses: "0",
      brokerNotes: "Commercial property submission for Front Range Fabrication in Colorado. The building was constructed in 2008, is owner occupied and sprinklered, and had no losses in the past three years.",
      publicSourceUrl: "",
    },
  },
  {
    id: "warehouse", label: "New Jersey warehouse - value and age referrals",
    form: {
      insuredName: "Garden State Distribution", state: "NJ", tiv: "6800000", yearBuilt: "1974", losses: "1",
      brokerNotes: "Commercial property submission for Garden State Distribution in New Jersey. The warehouse was built in 1974, has $6.8 million in total insured value, and reported one loss in the past three years.",
      publicSourceUrl: "",
    },
  },
  {
    id: "retail", label: "Pennsylvania retail - loss referral",
    form: {
      insuredName: "Keystone Market Group", state: "PA", tiv: "4100000", yearBuilt: "1999", losses: "4",
      brokerNotes: "Commercial property submission for Keystone Market Group in Pennsylvania. The retail building was constructed in 1999 and reported four losses in the past three years.",
      publicSourceUrl: "",
    },
  },
  {
    id: "follow-up", label: "New York restaurant - broker follow-up",
    form: {
      insuredName: "Canal Street Kitchen", state: "NY", tiv: "1750000", yearBuilt: "", losses: "",
      brokerNotes: "Commercial property submission for Canal Street Kitchen in New York. The restaurant occupies a single leased building. The broker has not yet supplied the construction year or recent loss history.",
      publicSourceUrl: "",
    },
  },
];

export function IntakeForm({ prefillSample = false }: { prefillSample?: boolean }) {
  const [form, setForm] = useState<FormState>(prefillSample ? sampleCases[1].form : emptyForm);
  const [selectedSample, setSelectedSample] = useState(prefillSample ? "colorado" : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof FormState, value: string) {
    setSelectedSample("");
    setForm((current) => ({ ...current, [field]: value }));
  }

  function loadSample(id: string) {
    setSelectedSample(id);
    setForm(sampleCases.find((sample) => sample.id === id)?.form ?? emptyForm);
    setError(null);
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
      </div>
      {error && <div className="alert" role="alert"><CircleAlert size={17} aria-hidden="true" />{error}</div>}
      <form className="card" onSubmit={createCase}>
        <div className="form-section sample-picker">
          <div className="form-section-title"><h2>Sample submission</h2></div>
          <label>Scenario
            <select value={selectedSample} onChange={(event) => loadSample(event.target.value)}>
              <option value="">Custom submission</option>
              {sampleCases.map((sample) => <option key={sample.id} value={sample.id}>{sample.label}</option>)}
            </select>
          </label>
        </div>
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
