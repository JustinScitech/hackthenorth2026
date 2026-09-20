"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { CaretDown, Check, FilePlus, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { caseAppetiteSchema, type CaseAppetite } from "@/lib/case-appetite";

function sampleAppetite(id: string): CaseAppetite {
  const year = new Date().getFullYear();
  return { business: "new", line: "property", premium: 85_000, constructionPercent: 75, lossValue: id === "follow-up" ? null : id === "retail" ? 125_000 : 0, lossHistoryComplete: id !== "follow-up", effective: `${year}-01-01`, expiration: `${year + 1}-01-01` };
}

type FormState = { insuredName: string; state: string; tiv: string; yearBuilt: string; losses: string; brokerNotes: string; publicSourceUrl: string };
const emptyForm: FormState = { insuredName: "", state: "", tiv: "", yearBuilt: "", losses: "", brokerNotes: "", publicSourceUrl: "" };
const sampleCases: { id: string; label: string; form: FormState }[] = [
  {
    id: "clean", label: "California office - appetite match",
    form: {
      insuredName: "Pacific Square Offices", state: "CA", tiv: "75000000", yearBuilt: "2012", losses: "0",
      brokerNotes: "Commercial property submission for Pacific Square Offices in California. The oldest building was constructed in 2012. Complete five-year loss dollars and construction mix are supplied in the form.",
      publicSourceUrl: "",
    },
  },
  {
    id: "colorado", label: "Colorado fabrication - acceptable risk",
    form: {
      insuredName: "Front Range Fabrication", state: "CO", tiv: "3200000", yearBuilt: "2008", losses: "0",
      brokerNotes: "Commercial property submission for Front Range Fabrication in Colorado. The building was constructed in 2008, is owner occupied and sprinklered, and had no losses in the past three years.",
      publicSourceUrl: "",
    },
  },
  {
    id: "warehouse", label: "New Jersey warehouse - territory and age referrals",
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

const sampleOptions = [{ id: "", label: "Custom submission" }, ...sampleCases];

function SamplePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = sampleOptions.findIndex((option) => option.id === value);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  function focusOption(index: number) {
    optionRefs.current[(index + sampleOptions.length) % sampleOptions.length]?.focus();
  }

  function openMenu(index: number) {
    setOpen(true);
    requestAnimationFrame(() => focusOption(index));
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = optionRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusOption(event.key === "Home" ? 0 : sampleOptions.length - 1);
    } else if (event.key === "Escape") {
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <div className="sample-select" ref={pickerRef} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
    }}>
      <span id="sample-scenario-label">Scenario</span>
      <button
        ref={triggerRef} className="sample-select-trigger" type="button"
        aria-labelledby="sample-scenario-label sample-selected-value" aria-haspopup="menu" aria-expanded={open} aria-controls="sample-scenario-menu"
        onClick={() => open ? setOpen(false) : openMenu(Math.max(selectedIndex, 0))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu(event.key === "ArrowDown" ? Math.max(selectedIndex, 0) : sampleOptions.length - 1);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        <span id="sample-selected-value">{sampleOptions[selectedIndex]?.label ?? "Custom submission"}</span>
        <CaretDown size={16} aria-hidden="true" />
      </button>
      {open && <div id="sample-scenario-menu" className="sample-select-menu popup" role="menu" aria-labelledby="sample-scenario-label" onKeyDown={handleMenuKeyDown}>
        {sampleOptions.map((option, index) => <button
          key={option.id || "custom"} ref={(element) => { optionRefs.current[index] = element; }}
          className="sample-select-option" type="button" role="menuitemradio" aria-checked={option.id === value}
          onClick={() => { onChange(option.id); setOpen(false); triggerRef.current?.focus(); }}
        >
          <span>{option.label}</span>{option.id === value && <Check size={15} aria-hidden="true" />}
        </button>)}
      </div>}
    </div>
  );
}

export function IntakeForm({ prefillSample = false }: { prefillSample?: boolean }) {
  const [appetite, setAppetite] = useState<CaseAppetite>(prefillSample ? sampleAppetite("colorado") : caseAppetiteSchema.parse({}));
  const [form, setForm] = useState<FormState>(prefillSample ? sampleCases[1].form : emptyForm);
  const [selectedSample, setSelectedSample] = useState(prefillSample ? "colorado" : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof FormState, value: string) {
    setSelectedSample("");
    setForm((current) => ({ ...current, [field]: value }));
  }

  function loadSample(id: string) {
    setAppetite(id ? sampleAppetite(id) : caseAppetiteSchema.parse({}));
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
          appetite,
        }),
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const error = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
        throw new Error(typeof error === "string"
          ? error
          : `Could not create case (HTTP ${response.status}). Check the web API logs.`);
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object" || !("id" in payload) || typeof payload.id !== "string") {
        throw new Error("Case API returned an empty or invalid response. Check the web API logs.");
      }
      window.location.assign(`/cases/${payload.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create case.");
      setSubmitting(false);
    }
  }

  return (
    <main className="shell shell-narrow">
      <p className="breadcrumb"><Link href="/overview">Commercial property</Link><span className="sep">/</span><Link href="/cases">Cases</Link><span className="sep">/</span><span className="current">New submission</span></p>
      <div className="page-title-row">
        <div><h1 className="page-title">New submission</h1><p className="subtle" style={{ marginTop: 6 }}>Start a durable review against the supplied 2025 commercial property appetite. Missing evidence pauses the review for broker clarification.</p></div>
      </div>
      {error && <div className="alert" role="alert"><WarningCircle size={17} aria-hidden="true" />{error}</div>}
      <form className="card" onSubmit={createCase}>
        <div className="form-section sample-picker">
          <div className="form-section-title"><h2>Sample submission</h2></div>
          <SamplePicker value={selectedSample} onChange={loadSample} />
        </div>
        <div className="form-section">
          <div className="form-section-title"><h2>Insured</h2><p>Who and what is being covered.</p></div>
          <label>Insured name<input required maxLength={160} value={form.insuredName} onChange={(event) => update("insuredName", event.target.value)} placeholder="Business name" /></label>
          <div className="field-pair">
            <label>State<input required maxLength={2} value={form.state} onChange={(event) => update("state", event.target.value.toUpperCase())} placeholder="CO" /></label>
            <label>Total insured value<input required min="1" type="number" value={form.tiv} onChange={(event) => update("tiv", event.target.value)} placeholder="3200000" /></label>
          </div>
          <div className="field-pair">
            <label>Oldest building year <span className="optional">Optional</span><input min="1800" max={new Date().getFullYear()} type="number" value={form.yearBuilt} onChange={(event) => update("yearBuilt", event.target.value)} placeholder="2008" /></label>
            <label>Historical loss count (context only) <span className="optional">Optional</span><input min="0" type="number" value={form.losses} onChange={(event) => update("losses", event.target.value)} placeholder="0" /></label>
          </div>
        </div>
        <div className="form-section">
          <div className="form-section-title"><h2>Carrier appetite evidence</h2><p>All amounts are USD. Leave unknown fields blank; do not substitute loss counts for five-year loss dollars.</p></div>
          <label>Business type<select value={appetite.business ?? ""} onChange={(event) => setAppetite({ ...appetite, business: event.target.value === "new" ? "new" : event.target.value === "renewal" ? "renewal" : null })}><option value="">Unknown</option><option value="new">New business</option><option value="renewal">Renewal business</option></select></label>
          <label>Line of business<input value={appetite.line ?? ""} onChange={(event) => setAppetite({ ...appetite, line: event.target.value || null })} placeholder="property" /></label>
          {([{ key: "premium", label: "Total premium (USD)" }, { key: "constructionPercent", label: "Eligible construction percent (by building count)" }, { key: "lossValue", label: "Five-year loss value (USD)" }] as const).map(({ key, label }) => <label key={key}>{label}<input type="number" min="0" max={key === "constructionPercent" ? 100 : undefined} step="any" value={appetite[key] ?? ""} onChange={(event) => setAppetite({ ...appetite, [key]: event.target.value === "" ? null : Number(event.target.value) })} /></label>)}
          <p className="subtle">Eligible construction: joisted masonry, non-combustible/steel, or masonry non-combustible.</p>
          <label><input type="checkbox" checked={appetite.lossHistoryComplete} onChange={(event) => setAppetite({ ...appetite, lossHistoryComplete: event.target.checked })} />The supplied loss dollars cover complete five-year account history.</label>
          <div className="field-pair">{(["effective", "expiration"] as const).map((key) => <label key={key}>{key === "effective" ? "Effective date" : "Expiration date"}<input type="date" value={appetite[key] ?? ""} onChange={(event) => setAppetite({ ...appetite, [key]: event.target.value || null })} /></label>)}</div>
        </div>
        <div className="form-section">
          <div className="form-section-title"><h2>Broker submission</h2><p>Paste the broker's notes. Unstructured text is fine; the agent extracts what it can and asks for the rest.</p></div>
          <label>Submission text<textarea required minLength={10} maxLength={20000} rows={8} value={form.brokerNotes} onChange={(event) => update("brokerNotes", event.target.value)} placeholder="Paste the broker's submission details here..." /></label>
          <label>Public source URL <span className="optional">Optional</span><input type="url" maxLength={2000} value={form.publicSourceUrl} onChange={(event) => update("publicSourceUrl", event.target.value)} placeholder="https://example.com/property" /></label>
        </div>
        <div className="form-footer">
          <span className="subtle">2025 carrier appetite. A final decision requires underwriter review.</span>
          <button className="primary-button" disabled={submitting} type="submit"><FilePlus size={16} />{submitting ? "Starting case..." : "Start analysis"}</button>
        </div>
      </form>
    </main>
  );
}
