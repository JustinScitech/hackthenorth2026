import Link from "next/link";
import { ArrowRight, BookOpen, Check, Database, FileSearch, ListOrdered, MessageSquareText, RefreshCw, ShieldCheck } from "lucide-react";
import { Mark } from "../ui/logo";

const STATES = ["received", "extracting", "checking", "waiting_for_broker", "review_ready", "approved / declined"];

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Commercial property underwriting</p>
          <h1>Underwriting review that pauses for people, not for outages.</h1>
          <p className="lede">Astra Risk reads a broker submission, extracts the facts, checks them against your appetite, and asks the broker for what is missing. Every case is a durable workflow, and every decision is an underwriter's.</p>
          <div className="cta-row">
            <Link className="primary-button accent" href="/cases/new?sample=1">Try the sample case<ArrowRight size={16} /></Link>
            <Link className="secondary-button" href="/docs"><BookOpen size={16} />Read the docs</Link>
          </div>
          <p className="hero-note"><span><Check size={14} />Durable Temporal workflows</span><span><Check size={14} />Human review on every decision</span><span><Check size={14} />Persisted audit trace</span></p>
        </div>
        <div className="hero-art" aria-hidden="true"><Mark size={320} priority /></div>
      </section>

      <section className="site-section" id="how-it-works">
        <div className="site-section-head"><h2>How a case moves</h2><p>A submission becomes a workflow the moment it lands. The states below are the only ones a case can be in, and each transition is recorded.</p></div>
        <div className="lifecycle" aria-label="Case lifecycle">
          {STATES.map((state, index) => <span key={state} style={{ display: "contents" }}>{index > 0 && <ArrowRight className="arrow" size={14} aria-hidden="true" />}<code className={`state${state === "waiting_for_broker" ? " optional" : ""}`}>{state}</code></span>)}
        </div>
        <div className="steps">
          <div className="step"><span className="step-num">1</span><h3>Extract</h3><p>Structured facts come out of unstructured broker notes, each with a source and a confidence. A second model can cross-check for contradictions.</p></div>
          <div className="step"><span className="step-num">2</span><h3>Check</h3><p>Facts run against guideline rules. Passes, referrals, and unknowns are listed with the rule and the evidence behind each one.</p></div>
          <div className="step"><span className="step-num">3</span><h3>Pause and resume</h3><p>Missing information pauses the case on a durable wait. The broker's reply is a signal; the workflow picks up where it left off, even after a restart.</p></div>
        </div>
      </section>

      <section className="site-section">
        <div className="split">
          <div>
            <div className="site-section-head"><h2>A small API, same origin</h2><p>Create a case, poll it, and deliver broker or underwriter actions as idempotent signals. The UI uses exactly these endpoints.</p></div>
            <Link className="secondary-button" href="/docs#api">API reference<ArrowRight size={16} /></Link>
          </div>
          <div>
            <p className="code-block-title"><span className="method method-post">POST</span>/api/cases</p>
            <pre className="code-block">{"{"}{"\n"}  <span className="k">"insuredName"</span>: <span className="s">"Front Range Fabrication"</span>,{"\n"}  <span className="k">"state"</span>: <span className="s">"CO"</span>,{"\n"}  <span className="k">"tiv"</span>: 3200000,{"\n"}  <span className="k">"yearBuilt"</span>: 2008,{"\n"}  <span className="k">"losses"</span>: 0,{"\n"}  <span className="k">"brokerNotes"</span>: <span className="s">"Owner occupied, sprinklered…"</span>,{"\n"}  <span className="k">"publicSourceUrl"</span>: null{"\n"}{"}"}{"\n"}<span className="cm">// 201 → {"{"} "id": "b3f0…" {"}"}  the id is the workflow id</span></pre>
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-section-head"><h2>Built for review, not for auto-binding</h2><p>The agent prioritizes and explains. It never quotes or binds coverage.</p></div>
        <div className="feature-grid">
          <div className="feature"><span className="feature-icon"><RefreshCw size={16} /></span><h3>Durable by default</h3><p>Retries, timers, and signals live in Temporal. A stopped worker resumes cases after restart without losing a step.</p></div>
          <div className="feature"><span className="feature-icon"><MessageSquareText size={16} /></span><h3>Conversational case view</h3><p>Submission, agent findings, and the action needed read like a thread. The activity trace shows what happened and when.</p></div>
          <div className="feature"><span className="feature-icon"><ShieldCheck size={16} /></span><h3>Underwriter decides</h3><p>Approve or decline with a recorded rationale. Decisions are durable signals with an idempotency key.</p></div>
          <div className="feature"><span className="feature-icon"><FileSearch size={16} /></span><h3>Cited public evidence</h3><p>Optionally visit one explicit public URL and attach an excerpt as evidence, never as a verified fact.</p></div>
          <div className="feature"><span className="feature-icon"><ListOrdered size={16} /></span><h3>Live appetite triage</h3><p>Rank a live submission queue against a published appetite with factor-level scores and query reasoning.</p></div>
          <div className="feature"><span className="feature-icon"><Database size={16} /></span><h3>Small, typed state</h3><p>Case records and audit events in PostgreSQL, documents in MongoDB. Workflow history stays lean.</p></div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-section-head"><h2>Runs with what you have</h2><p>The core demo needs PostgreSQL, MongoDB, and Temporal. Everything else is optional and switched on by an environment variable.</p></div>
        <div className="chip-row">
          <span className="chip">Next.js</span><span className="chip">Temporal</span><span className="chip">PostgreSQL</span><span className="chip">MongoDB</span>
          <span className="chip optional">OpenAI </span><span className="chip optional">Gemini </span><span className="chip optional">Browserbase </span><span className="chip optional">Sentry </span><span className="chip optional">ElevenLabs </span><span className="chip optional">Federato </span>
        </div>
      </section>
    </>
  );
}
