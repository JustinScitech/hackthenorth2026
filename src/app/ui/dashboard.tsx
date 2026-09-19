"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ClipboardList, FilePlus2, RotateCw } from "lucide-react";
import type { CaseRecord } from "@/lib/types";
import { Status } from "./status";

type FormState = { insuredName: string; state: string; tiv: string; yearBuilt: string; losses: string; brokerNotes: string; publicSourceUrl: string };
const emptyForm: FormState = { insuredName: "", state: "", tiv: "", yearBuilt: "", losses: "", brokerNotes: "", publicSourceUrl: "" };
const sampleForm: FormState = {
  insuredName: "Front Range Fabrication", state: "CO", tiv: "3200000", yearBuilt: "2008", losses: "0",
  brokerNotes: "Commercial property submission for Front Range Fabrication in Colorado. The building was constructed in 2008, is owner occupied and sprinklered, and had no losses in the past three years.",
  publicSourceUrl: "",
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

  return <main className="case-workspace">
    <aside className="case-navigation" aria-label="Case navigation">
      <div className="new-case-link selected"><FilePlus2 size={17} /> New submission</div>
      <p className="nav-caption">Recent cases</p>
      <nav className="case-history">{cases.map((item) => <Link key={item.id} href={`/cases/${item.id}`}><span>{item.insuredName}</span><small>{item.state} · {item.status.replaceAll("_", " ")}</small></Link>)}</nav>
      <Link className="nav-footer-link" href="/triage"><ClipboardList size={16} /> Federato triage</Link>
    </aside>
    <div className="case-main-area">
      <div className="case-toolbar"><span>New submission</span><button className="icon-button" type="button" onClick={() => void refresh()} aria-label="Refresh cases" title="Refresh cases"><RotateCw size={17} /></button></div>
      <div className="dashboard-intake">
        <div className="page-heading"><div><p className="eyebrow">Underwriting workspace</p><h1>New submission</h1><p className="subtle">Commercial property review</p></div><button className="quiet-button" type="button" onClick={() => setForm(sampleForm)}>Load Colorado sample</button></div>
        {error && <div className="alert" role="alert">{error}</div>}
        <form className="intake-form" onSubmit={createCase}>
          <label>Insured name<input required maxLength={160} value={form.insuredName} onChange={(event) => update("insuredName", event.target.value)} placeholder="Business name" /></label>
          <div className="field-pair"><label>State<input required maxLength={2} value={form.state} onChange={(event) => update("state", event.target.value.toUpperCase())} placeholder="CO" /></label><label>Total insured value<input required min="1" type="number" value={form.tiv} onChange={(event) => update("tiv", event.target.value)} placeholder="3200000" /></label></div>
          <div className="field-pair"><label>Year built <span className="optional">Optional</span><input min="1800" max={new Date().getFullYear()} type="number" value={form.yearBuilt} onChange={(event) => update("yearBuilt", event.target.value)} placeholder="2008" /></label><label>Loss count <span className="optional">Optional</span><input min="0" type="number" value={form.losses} onChange={(event) => update("losses", event.target.value)} placeholder="0" /></label></div>
          <label>Broker submission<textarea required minLength={10} maxLength={20000} rows={7} value={form.brokerNotes} onChange={(event) => update("brokerNotes", event.target.value)} placeholder="Paste the broker's submission details here..." /></label>
          <label>Public source URL <span className="optional">Optional</span><input type="url" maxLength={2000} value={form.publicSourceUrl} onChange={(event) => update("publicSourceUrl", event.target.value)} placeholder="https://example.com/property" /></label>
          <button className="primary-button" disabled={submitting} type="submit"><FilePlus2 size={17} />{submitting ? "Starting case..." : "Start analysis"}</button>
        </form>
        <section className="mobile-case-list" aria-labelledby="recent-title"><div className="section-heading"><h2 id="recent-title">Recent cases</h2><span className="count">{cases.length}</span></div>{loading ? <p className="empty-state">Loading cases...</p> : cases.length === 0 ? <p className="empty-state">No cases yet.</p> : cases.map((item) => <Link className="mobile-case-row" key={item.id} href={`/cases/${item.id}`}><strong>{item.insuredName}</strong><Status value={item.status} /></Link>)}</section>
        <p className="demo-note">Fictional demo rules. A final decision requires underwriter review.</p>
      </div>
    </div>
  </main>;
}
