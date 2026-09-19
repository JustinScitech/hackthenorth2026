"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleAlert, RotateCw } from "lucide-react";
import type { QuoteRecord } from "@/lib/quotes";

const statusLabel: Record<QuoteRecord["status"], string> = { choosing: "Choosing product", needs_info: "Needs details", estimate: "Estimate shown", refer: "Referred to advisor" };
const fieldLabel: Record<string, string> = {
  province: "Province", contentsValue: "Contents", deductible: "Deductible", liabilityLimit: "Liability", buildingType: "Home", priorClaims: "Claims", smokeDetectors: "Smoke detectors", sprinklers: "Sprinklers",
  driverAge: "Driver age", yearsLicensed: "Years licensed", vehicleYear: "Vehicle year", vehicleMake: "Make", vehicleModel: "Model", vehicleValue: "Vehicle value", annualKm: "Km/year", usage: "Use", atFaultAccidents: "At-fault accidents", convictions: "Convictions", coverage: "Coverage", winterTires: "Winter tires",
};
const money = new Set(["contentsValue", "deductible", "liabilityLimit", "vehicleValue"]);
function show(field: string, value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number" && money.has(field)) return `$${value.toLocaleString("en-CA")}`;
  return String(value).replaceAll("_", " ");
}

/** Recent quote requests from the public assistant: what was heard, what came back, and who needs an advisor. */
export function QuoteList() {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/quotes", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load quotes.");
      setQuotes(data.quotes); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load quotes."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 10_000); return () => clearInterval(timer); }, [refresh]);
  const referrals = quotes.filter((quote) => quote.status === "refer").length;

  return (
    <main className="shell">
      <p className="breadcrumb"><Link href="/overview">Personal lines</Link><span className="sep">/</span><span className="current">Quotes</span></p>
      <div className="page-title-row">
        <h1 className="page-title">Quote requests</h1>
        <div className="actions">
          <button className="icon-button" type="button" onClick={() => void refresh()} aria-label="Refresh quotes" title="Refresh quotes"><RotateCw size={16} /></button>
          <Link className="primary-button" href="/quote" target="_blank" rel="noopener noreferrer">Open the public assistant<ArrowUpRight size={14} /></Link>
        </div>
      </div>
      <p className="lede">Every conversation on the public estimate page lands here as one evolving record: the facts the assistant heard, the estimate or next step it gave, and whether an advisor needs to follow up. Free text is never stored.</p>
      {error && <div className="alert" role="alert"><CircleAlert size={17} aria-hidden="true" />{error}</div>}
      <div className="card">
        <div className="card-header"><span>{referrals ? `${referrals} waiting for an advisor` : "No referrals waiting"}</span><span className="count">{quotes.length}</span></div>
        {loading ? <p className="empty-state">Loading quotes...</p> : quotes.length === 0 ? <p className="empty-state">No quote requests yet. Try the public assistant to see one appear.</p> : (
          <div className="quote-rows">
            {quotes.map((quote) => (
              <article className="quote-row" key={quote.id} aria-label={`Quote ${quote.id.slice(0, 8)}`}>
                <div className="quote-row-main">
                  <strong>{quote.product === "tenant" ? "Tenant insurance" : quote.product === "auto" ? "Car insurance" : "Product not chosen"}{quote.province ? ` · ${quote.province}` : ""}</strong>
                  <span className={`status status-quote-${quote.status}`}><span className="status-dot" />{statusLabel[quote.status]}</span>
                </div>
                <div className="quote-row-outcome">
                  {quote.estimate ? <strong>${quote.estimate.monthlyLow}–${quote.estimate.monthlyHigh} a month</strong> : quote.referral ? <span>{quote.referral}</span> : <span>{quote.openQuestions} open question{quote.openQuestions === 1 ? "" : "s"}</span>}
                  <small>{quote.turns} turn{quote.turns === 1 ? "" : "s"}{quote.model ? ` · read with ${quote.model}` : " · parser only"} · <time dateTime={quote.updatedAt}>{new Date(quote.updatedAt).toLocaleString()}</time></small>
                </div>
                <dl className="quote-heard">{Object.entries(quote.heard).filter(([field]) => fieldLabel[field]).map(([field, value]) => <div key={field}><dt>{fieldLabel[field]}</dt><dd>{show(field, value)}</dd></div>)}</dl>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
