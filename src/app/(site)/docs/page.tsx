import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";

export const metadata: Metadata = { title: "Docs and API reference", description: "How Astra Risk cases move, how to run it, and the HTTP API the workspace uses." };

const NAV = [
  { group: "Guide", items: [["#introduction", "Introduction"], ["#quickstart", "Quickstart"], ["#lifecycle", "Case lifecycle"], ["#actions", "Broker and underwriter actions"], ["#trace", "Activity trace"]] },
  { group: "API reference", items: [["#api", "Conventions"], ["#list-cases", "List cases"], ["#create-case", "Create a case"], ["#get-case", "Get a case"], ["#case-actions", "Deliver an action"], ["#case-audio", "Voice brief"], ["#triage", "Federato triage"], ["#types", "Types"]] },
  { group: "Configuration", items: [["#environment", "Environment variables"], ["#limits", "Limits and safety"]] },
];

function Endpoint({ method, path, id }: { method: "GET" | "POST"; path: string; id: string }) {
  return <div className="endpoint" id={id}><span className={`method method-${method.toLowerCase()}`}>{method}</span><code>{path}</code></div>;
}

export default function DocsPage() {
  return (
    <div className="docs">
      <nav className="docs-nav" aria-label="Docs sections">
        {NAV.map((section) => <span key={section.group} style={{ display: "contents" }}><span className="label-mono">{section.group}</span>{section.items.map(([href, label]) => <a key={href} href={href}>{label}</a>)}</span>)}
      </nav>

      <article className="docs-content">
        <p className="eyebrow">Documentation</p>
        <h1 id="introduction">Astra Risk docs and API reference</h1>
        <p className="lede">Astra Risk is a durable, human-reviewed underwriting agent for commercial property submissions. PostgreSQL jobs extract facts from a broker submission, check them against guidelines, pause for missing information, and resume when a broker responds. An underwriter makes every final decision.</p>
        <div className="notice"><Info size={17} aria-hidden="true" />The case review flow uses fictional demo guideline rules. The Federato triage flow uses the supplied 2025 sample appetite. Neither binds coverage.</div>

        <h2 id="quickstart">Quickstart</h2>
        <p>The core demo needs PostgreSQL and MongoDB. No model or sponsor keys are required; a deterministic extractor runs when no key is set.</p>
        <ol>
          <li>Start the services. With Docker: <code>docker compose up -d</code>. Without Docker, run PostgreSQL and MongoDB locally.</li>
          <li>Copy <code>.env.example</code> to <code>.env</code> and adjust the connection strings if needed.</li>
          <li>Run <code>npm install</code> and <code>npm run db:migrate</code>.</li>
          <li>Start the worker with <code>npm run worker</code>, then the web app with <code>npm run dev</code>.</li>
          <li>Open the <Link href="/overview">workspace</Link> and try the sample case.</li>
        </ol>
        <pre className="code-block"><code><span className="cm"># minimal .env</span>{"\n"}DATABASE_URL=postgres://underwriting:underwriting@localhost:5432/underwriting{"\n"}MONGODB_URI=mongodb://localhost:27017{"\n"}MONGODB_DB=underwriting_agent</code></pre>

        <h2 id="lifecycle">Case lifecycle</h2>
        <p>A case is always in exactly one of these states. Its work is recorded in the PostgreSQL job table.</p>
        <table className="docs-table"><thead><tr><th>State</th><th>Meaning</th></tr></thead><tbody>
          <tr><td><code>received</code></td><td>Created and queued for analysis.</td></tr>
          <tr><td><code>extracting</code></td><td>Facts are being extracted from the submission and any broker replies.</td></tr>
          <tr><td><code>checking</code></td><td>Facts are being checked against guideline rules.</td></tr>
          <tr><td><code>waiting_for_broker</code></td><td>Required information is missing. A question is stored on the case.</td></tr>
          <tr><td><code>review_ready</code></td><td>Checks are complete. An underwriter decision is needed.</td></tr>
          <tr><td><code>approved</code>, <code>declined</code></td><td>Terminal. The decision rationale is stored on the case.</td></tr>
          <tr><td><code>failed</code></td><td>Analysis could not continue after retries. The error is stored on the case.</td></tr>
        </tbody></table>
        <p>A scheduled PostgreSQL job records when broker follow-up is due after 24 hours; it does not send a message. Queued work survives worker restarts.</p>

        <h2 id="actions">Broker and underwriter actions</h2>
        <p>Actions enqueue durable jobs. A broker response is accepted only while the case is <code>waiting_for_broker</code>; an approve or decline only while it is <code>review_ready</code>. Each action carries a client-generated UUID so a retried request is a no-op rather than a duplicate. Reusing an ID with different content is rejected.</p>

        <h2 id="trace">Activity trace</h2>
        <p>Every case has a persisted audit trail: intake, extraction sources and missing fields, public research outcome, guideline counts, broker follow-ups, and review actions. It records what happened and when. It does not display or store a model's private reasoning.</p>

        <h2 id="api">API reference</h2>
        <p>All endpoints are same-origin, return JSON, and are the ones the workspace itself uses. Errors return <code>{"{ \"error\": string }"}</code> with a 4xx or 5xx status. A 503 means a backing database was unreachable.</p>

        <Endpoint method="GET" path="/api/cases" id="list-cases" />
        <p>Returns every case, newest first.</p>
        <pre className="code-block"><code>{"{ \"cases\": CaseRecord[] }"}</code></pre>

        <Endpoint method="POST" path="/api/cases" id="create-case" />
        <p>Stores the submission text in the document store, inserts the case, records a <code>case_created</code> event, and queues analysis. Returns <code>201</code> with the new ID.</p>
        <table className="docs-table"><thead><tr><th>Field</th><th>Type</th><th>Rules</th></tr></thead><tbody>
          <tr><td><code>insuredName</code></td><td>string</td><td>2 to 160 characters</td></tr>
          <tr><td><code>state</code></td><td>string</td><td>Two-letter code; upper-cased</td></tr>
          <tr><td><code>tiv</code></td><td>number</td><td>Positive, at most 1,000,000,000</td></tr>
          <tr><td><code>yearBuilt</code></td><td>integer | null</td><td>1800 to the current year</td></tr>
          <tr><td><code>losses</code></td><td>integer | null</td><td>0 to 1000</td></tr>
          <tr><td><code>brokerNotes</code></td><td>string</td><td>10 to 20,000 characters</td></tr>
          <tr><td><code>publicSourceUrl</code></td><td>string | null</td><td>Public HTTPS URL, at most 2000 characters. Private hosts are rejected.</td></tr>
        </tbody></table>
        <pre className="code-block"><code>{"201 { \"id\": \"<uuid>\" }\n400 { \"error\": \"Check the submission fields and try again.\" }\n503 { \"error\": \"Could not start this case. Check local services and worker.\" }"}</code></pre>

        <Endpoint method="GET" path="/api/cases/{id}" id="get-case" />
        <p>Returns the case, its audit events, and whether a voice brief can be generated. The workspace polls this every few seconds.</p>
        <pre className="code-block"><code>{"{ \"case\": CaseRecord, \"audit\": AuditEvent[], \"voiceAvailable\": boolean }\n400 invalid id · 404 not found · 503 unavailable"}</code></pre>

        <Endpoint method="POST" path="/api/cases/{id}/actions" id="case-actions" />
        <p>Queues a broker response or an underwriter decision. The body is one of two shapes, discriminated by <code>kind</code>.</p>
        <pre className="code-block"><code>{"{ \"id\": \"<uuid>\", \"kind\": \"broker_response\", \"response\": string }   // 3 to 10,000 chars\n{ \"id\": \"<uuid>\", \"kind\": \"approve\" | \"decline\", \"reason\": string } // 3 to 2,000 chars"}</code></pre>
        <table className="docs-table"><thead><tr><th>Status</th><th>When</th></tr></thead><tbody>
          <tr><td><code>200</code></td><td><code>{"{ \"ok\": true }"}</code>. Delivered, or already delivered with the same ID and content.</td></tr>
          <tr><td><code>409</code></td><td>The case is not in the state that action expects, or the ID was already used for different content.</td></tr>
          <tr><td><code>503</code></td><td>The action could not be queued. Retrying with the same ID is safe.</td></tr>
        </tbody></table>

        <Endpoint method="GET" path="/api/cases/{id}/audio" id="case-audio" />
        <p>Streams the review brief as <code>audio/mpeg</code> using ElevenLabs. Returns <code>503</code> when no key is configured and <code>409</code> when the brief is not ready.</p>

        <Endpoint method="POST" path="/api/triage" id="triage" />
        <p>Runs live Federato appetite triage: discovers the schema, builds reference-aware queries, paginates the selected resource, and ranks records. It accepts only same-origin requests and returns <code>403</code> otherwise. This is a synchronous request today, not a durable job.</p>
        <pre className="code-block"><code>{"{\n  \"resource\": string, \"total\": number, \"evaluated\": number, \"truncated\": boolean,\n  \"generatedAt\": string, \"guidelineVersion\": string, \"top\": number,\n  \"reasoning\": string[], \"trace\": { \"reason\": string, \"query\": object, \"returned\": number }[],\n  \"ranked\": RankedSubmission[], \"topSubmissions\": RankedSubmission[]\n}"}</code></pre>

        <h3 id="types">Types</h3>
        <table className="docs-table"><thead><tr><th>Type</th><th>Shape</th></tr></thead><tbody>
          <tr><td><code>CaseRecord</code></td><td><code>id</code>, <code>insuredName</code>, <code>state</code>, <code>tiv</code>, <code>yearBuilt</code>, <code>losses</code>, <code>publicSourceUrl</code>, <code>publicEvidence</code>, <code>extractionConflicts</code>, <code>status</code>, <code>facts</code>, <code>findings</code>, <code>brief</code>, <code>question</code>, <code>decision</code>, <code>error</code>, <code>analysisRevision</code>, <code>createdAt</code>, <code>updatedAt</code></td></tr>
          <tr><td><code>Fact&lt;T&gt;</code></td><td><code>{"{ value: T | null, source: string, confidence: number }"}</code></td></tr>
          <tr><td><code>Finding</code></td><td><code>{"{ id, label, result: \"pass\" | \"refer\" | \"unknown\", detail, source }"}</code></td></tr>
          <tr><td><code>AuditEvent</code></td><td><code>{"{ id, eventType, detail: object, createdAt }"}</code></td></tr>
        </tbody></table>

        <h2 id="environment">Environment variables</h2>
        <p>Set these in <code>.env</code>. PostgreSQL and MongoDB are required; the rest switch on authentication or optional integrations.</p>
        <table className="docs-table"><thead><tr><th>Variable</th><th>Purpose</th></tr></thead><tbody>
          <tr><td><code>DATABASE_URL</code></td><td>PostgreSQL for cases and audit events. Required.</td></tr>
          <tr><td><code>MONGODB_URI</code>, <code>MONGODB_DB</code></td><td>Document store for submissions, replies, and public evidence. Required.</td></tr>
          <tr><td><code>GEMINI_API_KEY</code>, <code>GEMINI_MODEL</code></td><td>Primary structured extraction from broker notes. Without a key or available credits, the deterministic extractor runs and facts remain source-labeled.</td></tr>
          <tr><td><code>BROWSERBASE_API_KEY</code></td><td>Visit an explicitly supplied public URL and attach a cited excerpt.</td></tr>
          <tr><td><code>SENTRY_DSN</code></td><td>Privacy-minimized worker error monitoring.</td></tr>
          <tr><td><code>ELEVENLABS_API_KEY</code>, <code>ELEVENLABS_VOICE_ID</code></td><td>Spoken review brief.</td></tr>
          <tr><td><code>FEDERATO_CLIENT_ID</code>, <code>FEDERATO_CLIENT_SECRET</code></td><td>Live Federato triage. <code>FEDERATO_RESOURCE</code> and <code>FEDERATO_FIELD_MAP</code> override discovery.</td></tr>
        </tbody></table>

        <h2 id="limits">Limits and safety</h2>
        <ul>
          <li>Guideline matching prioritizes human review. The agent never quotes or binds coverage.</li>
          <li>Public research visits only the URL the submitter supplied. It does not discover or profile people, and page text is shown as evidence, not treated as a verified fact.</li>
          <li>Jobs retry with backoff and recover expired leases. Submissions and audit data are stored in PostgreSQL and MongoDB.</li>
          <li>Triage evaluates at most 1,000 records per run and marks the report as truncated when it hits that limit.</li>
        </ul>
      </article>
    </div>
  );
}
