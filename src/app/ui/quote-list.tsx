"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ArrowsClockwise, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { QuoteRecord } from "@/lib/quotes";

const statusLabel: Record<QuoteRecord["status"], string> = { choosing: "Product not selected", needs_info: "Details needed", estimate: "Estimate ready", refer: "Advisor review needed" };
const filters = [{ id: "all", label: "All requests" }, { id: "refer", label: "Advisor review" }, { id: "incomplete", label: "Incomplete" }, { id: "estimate", label: "Estimates ready" }] as const;
type Filter = typeof filters[number]["id"];
function matchesFilter(quote: QuoteRecord, filter: Filter) {
  return filter === "all" || (filter === "incomplete" ? quote.status === "choosing" || quote.status === "needs_info" : quote.status === filter);
}
const fieldLabel: Record<string, string> = {
  province: "Province", contentsValue: "Contents", deductible: "Deductible", liabilityLimit: "Liability", buildingType: "Home", priorClaims: "Claims", smokeDetectors: "Smoke detectors", sprinklers: "Sprinklers",
  driverAge: "Driver age", yearsLicensed: "Years licensed", vehicleYear: "Vehicle year", vehicleMake: "Make", vehicleModel: "Model", vehicleValue: "Vehicle value", annualKm: "Km/year", usage: "Use", atFaultAccidents: "At-fault accidents", convictions: "Convictions", coverage: "Coverage", winterTires: "Winter tires",
};
const money = new Set(["contentsValue", "deductible", "liabilityLimit", "vehicleValue"]);
function show(field: string, value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return `${money.has(field) ? "$" : ""}${field === "vehicleYear" ? value : value.toLocaleString("en-CA")}`;
  return String(value).replaceAll("_", " ");
}

/** Recent quote requests from the public assistant: what was heard, what came back, and who needs an advisor. */
export function QuoteList() {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
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
  const visibleQuotes = quotes.filter((quote) => matchesFilter(quote, filter));

  return (
    <main className="shell quote-workspace">
      <p className="breadcrumb"><Link href="/overview">Personal lines</Link><span className="sep">/</span><span className="current">Quotes</span></p>
      <div className="page-title-row">
        <h1 className="page-title">Quote requests</h1>
        <div className="actions">
          <button className="icon-button" type="button" onClick={() => void refresh()} aria-label="Refresh quotes" title="Refresh quotes"><ArrowsClockwise size={16} /></button>
          <Link className="primary-button" href="/quote" target="_blank" rel="noopener noreferrer">New estimate<ArrowUpRight size={14} /></Link>
        </div>
      </div>
      <p className="quote-intro">Review personal insurance requests and estimates from the public estimate form.</p>
      {error && <div className="alert" role="alert"><WarningCircle size={17} aria-hidden="true" />{error}</div>}
      <div className="quote-filters" role="group" aria-label="Filter quote requests">
        {filters.map((item) => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{quotes.filter((quote) => matchesFilter(quote, item.id)).length}</span></button>)}
      </div>
      <div className="card">
        <div className="card-header"><span>{filters.find((item) => item.id === filter)?.label}</span><span className="subtle">Latest 50 requests · newest first</span></div>
        {loading ? <p className="empty-state" role="status">Loading requests…</p> : error && quotes.length === 0 ? <p className="empty-state">Requests could not be loaded. Use refresh to try again.</p> : quotes.length === 0 ? <p className="empty-state">No requests yet. Start a new estimate to see it here.</p> : visibleQuotes.length === 0 ? <p className="empty-state">No requests in this category. Select All requests to see the rest.</p> : (
          <div className="quote-rows">
            {visibleQuotes.map((quote) => (
              <article className="quote-row" key={quote.id} aria-label={`Quote ${quote.id.slice(0, 8)}`}>
                <div className="quote-row-main">
                  <strong>{quote.product === "tenant" ? "Tenant insurance" : quote.product === "auto" ? "Car insurance" : "Product not chosen"}{quote.province ? ` · ${quote.province}` : ""}</strong>
                  <span className={`status status-quote-${quote.status}`}><span className="status-dot" />{statusLabel[quote.status]}</span>
                </div>
                <div className="quote-row-outcome">
                  {quote.estimate ? <strong>${quote.estimate.monthlyLow.toLocaleString("en-CA")}–${quote.estimate.monthlyHigh.toLocaleString("en-CA")} <span className="quote-price-unit">CAD / month · demo estimate</span></strong> : quote.referral ? <span>{quote.referral}</span> : <span>{quote.status === "choosing" ? "An insurance product must be selected before estimating." : `${quote.openQuestions} unanswered question${quote.openQuestions === 1 ? "" : "s"} in the estimate form.`}</span>}
                  <small>Updated <time dateTime={quote.updatedAt}>{new Date(quote.updatedAt).toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</time> · Request {quote.id.slice(0, 8)}</small>
                </div>
                <details className="quote-request-details">
                  <summary>View request details</summary>
                  {Object.keys(quote.heard).some((field) => fieldLabel[field]) ? <dl className="quote-heard">{Object.entries(fieldLabel).filter(([field]) => quote.heard[field] !== undefined).map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{show(field, quote.heard[field])}</dd></div>)}</dl> : <p className="subtle">No insurance details supplied yet.</p>}
                  {quote.status === "refer" && <p className="subtle">Review the reason above with a licensed advisor. No contact details are collected here, and no referral has been sent.</p>}
                </details>
              </article>
            ))}
          </div>
        )}
      </div>
      <p className="quote-workspace-note">Illustrative estimates, not insurer quotes or bound coverage. This view stores supplied facts and the latest result, not conversation transcripts or contact details.</p>
    </main>
  );
}
