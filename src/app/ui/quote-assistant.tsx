"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowsClockwise, Car, House, PaperPlaneTilt, ShieldCheck, User, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { provinces } from "@/quote/rating";
import type { Product, QuoteQuestion, QuoteResult } from "@/quote/types";

type Answers = Record<string, string | number | boolean | null>;
type Message = { id: number; role: "you" | "assistant"; text: string };
type Reply = { product: Product | null; heard: Answers; result: QuoteResult | null; model: string | null; error?: string };

const numberFields = new Set(["contentsValue", "vehicleValue", "driverAge", "yearsLicensed", "vehicleYear", "annualKm", "priorClaims", "atFaultAccidents", "convictions"]);
const choices: Record<string, { value: string; label: string }[]> = {
  province: Object.entries(provinces).map(([code, item]) => ({ value: code, label: item.name })),
  deductible: [{ value: "500", label: "$500" }, { value: "1000", label: "$1,000" }, { value: "2500", label: "$2,500" }],
  liabilityLimit: [{ value: "1000000", label: "$1 million" }, { value: "2000000", label: "$2 million" }],
  buildingType: [{ value: "apartment", label: "Apartment" }, { value: "condo", label: "Condo" }, { value: "house", label: "House" }, { value: "basement", label: "Basement suite" }],
  usage: [{ value: "pleasure", label: "Pleasure" }, { value: "commute", label: "Commuting" }, { value: "business", label: "Business" }],
  coverage: [{ value: "liability_only", label: "Liability only" }, { value: "standard", label: "Standard" }, { value: "full", label: "Full (collision and comprehensive)" }],
  smokeDetectors: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }],
  sprinklers: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }],
  winterTires: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }],
};
const numericChoices = new Set(["deductible", "liabilityLimit"]);
const booleanChoices = new Set(["smokeDetectors", "sprinklers", "winterTires"]);

function coerce(field: string, raw: string): string | number | boolean | null {
  if (raw === "") return null;
  if (booleanChoices.has(field)) return raw === "true";
  if (numericChoices.has(field) || numberFields.has(field)) { const value = Number(raw); return Number.isFinite(value) ? value : null; }
  return raw;
}

function QuestionField({ question, value, onChange }: { question: QuoteQuestion; value: string; onChange: (value: string) => void }) {
  const id = useId();
  const options = choices[question.field];
  return <div className="quote-question">
    <label htmlFor={id}>{question.question}</label>
    {options
      ? <select id={id} value={value} aria-describedby={`${id}-why`} onChange={(event) => onChange(event.target.value)}><option value="">Choose…</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      : <input id={id} type={numberFields.has(question.field) ? "number" : "text"} inputMode={numberFields.has(question.field) ? "numeric" : undefined} min={0} value={value} aria-describedby={`${id}-why`} onChange={(event) => onChange(event.target.value)} />}
    <small id={`${id}-why`}>{question.why}</small>
  </div>;
}

function EstimateCard({ result }: { result: QuoteResult }) {
  if (!result.estimate) return null;
  const { monthlyLow, monthlyHigh, annualLow, annualHigh } = result.estimate;
  return <div className="quote-estimate" aria-label="Estimate">
    <p className="message-label">Estimated price</p>
    <p className="quote-price"><strong>${monthlyLow}–${monthlyHigh}</strong> a month</p>
    <p className="subtle">About ${annualLow.toLocaleString("en-CA")}–${annualHigh.toLocaleString("en-CA")} a year, in Canadian dollars.</p>
    {result.factors.length > 0 && <ul className="quote-factors" aria-label="What affects the price">{result.factors.map((factor) => <li key={factor.label} data-effect={factor.effect}><strong>{factor.label}</strong><span>{factor.detail}</span></li>)}</ul>}
    {result.assumptions.length > 0 && <p className="quote-assumptions"><strong>Assumed for now:</strong> {result.assumptions.join(" ")}</p>}
  </div>;
}

export function QuoteAssistant() {
  const [messages, setMessages] = useState<Message[]>([{ id: 0, role: "assistant", text: "Tell me what you need in your own words: tenant or car insurance, where you live, and anything you already know, like your car or roughly what your belongings are worth. I will ask for what is missing." }]);
  const [text, setText] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [pending, setPending] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);
  // One id per conversation so the workspace sees a single evolving quote, not one row per turn.
  const quoteId = useRef<string | null>(null);

  async function ask(body: { product: Product | null; text?: string; answers: Answers }, said?: string) {
    setBusy(true); setError(null);
    if (said) setMessages((current) => [...current, { id: nextId.current++, role: "you", text: said }]);
    quoteId.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, quoteId: quoteId.current }) });
      const reply = await response.json() as Reply;
      if (!response.ok) throw new Error(reply.error ?? "Something went wrong.");
      setProduct(reply.product); setResult(reply.result); setModel(reply.model); setPending({});
      // Facts heard in earlier turns stay in play, so the assistant never asks twice.
      setAnswers((current) => ({ ...current, ...reply.heard }));
      const line = !reply.product ? "Which would you like an estimate for: tenant insurance or car insurance?"
        : reply.result ? `${reply.result.recommendation} ${reply.result.questions.length ? `I have ${reply.result.questions.length === 1 ? "one question" : `${reply.result.questions.length} questions`} for you below.` : ""}`.trim() : "Something went wrong.";
      setMessages((current) => [...current, { id: nextId.current++, role: "assistant", text: line }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const said = text.trim();
    if (!said) return;
    setText("");
    void ask({ product, text: said, answers }, said);
  }

  function choose(next: Product) {
    setProduct(next);
    void ask({ product: next, answers }, next === "tenant" ? "Tenant insurance, please." : "Car insurance, please.");
  }

  function submitAnswers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const merged: Answers = { ...answers };
    for (const [field, raw] of Object.entries(pending)) { const value = coerce(field, raw); if (value !== null) merged[field] = value; }
    setAnswers(merged);
    void ask({ product, answers: merged }, "Here are the details you asked for.");
  }

  return <div className="quote-shell">
    <ol className="quote-thread" aria-label="Conversation">
      {messages.map((message) => <li key={message.id} className={`conversation-message ${message.role === "you" ? "request-message" : "agent-message"}`}>
        <div className={`message-avatar ${message.role === "you" ? "requester-avatar" : "agent-avatar"}`}>{message.role === "you" ? <User size={16} aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}</div>
        <div className="message-content"><p className="message-label">{message.role === "you" ? "You" : "Astra assistant"}</p><p className="brief">{message.text}</p></div>
      </li>)}
    </ol>
    <div aria-live="polite" className="quote-live">
      {busy && <p className="progress-line" role="status"><ArrowsClockwise size={16} aria-hidden="true" />Working out your estimate…</p>}
      {error && <div className="alert" role="alert"><WarningCircle size={17} aria-hidden="true" />{error}</div>}
      {!product && messages.length > 1 && !busy && <div className="quote-products">
        <button type="button" className="secondary-button" onClick={() => choose("tenant")}><House size={15} aria-hidden="true" />Tenant insurance</button>
        <button type="button" className="secondary-button" onClick={() => choose("auto")}><Car size={15} aria-hidden="true" />Car insurance</button>
      </div>}
      {result && <section className="quote-result" aria-label="Your estimate">
        {result.status === "estimate" && <EstimateCard result={result} />}
        {result.status === "refer" && <div className="notice"><WarningCircle size={17} aria-hidden="true" />{result.recommendation}</div>}
        <ul className="quote-steps" aria-label="Next steps">{result.nextSteps.map((step) => <li key={step}>{step}</li>)}</ul>
        {result.questions.length > 0 && <form className="quote-questions" onSubmit={submitAnswers}>
          <fieldset><legend>{result.status === "needs_info" ? "A few details before an estimate" : "Refine the estimate"}</legend>
            {result.questions.map((question) => <QuestionField key={question.field} question={question} value={pending[question.field] ?? ""} onChange={(value) => setPending((current) => ({ ...current, [question.field]: value }))} />)}
          </fieldset>
          <button className="primary-button" type="submit" disabled={busy}>Update estimate</button>
        </form>}
        <p className="demo-note">{result.disclaimer}{model ? ` Your message was read with ${model} and checked against the built-in parser.` : ""}</p>
      </section>}
    </div>
    <form className="quote-composer" onSubmit={send}>
      <label>Your message<textarea rows={3} maxLength={4000} value={text} onChange={(event) => setText(event.target.value)} placeholder="For example: I rent an apartment in Toronto and my things are worth about $20,000." /></label>
      <button className="primary-button" type="submit" disabled={busy || !text.trim()}><PaperPlaneTilt size={15} aria-hidden="true" />Send</button>
    </form>
  </div>;
}
