import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = { title: "How to use Astra Risk", description: "Get an insurance estimate by chatting, hand a commercial property submission to the underwriting agent, and see what it gives back." };

const NAV = [
  { group: "Guide", items: [["#introduction", "What Astra Risk does"], ["#estimate", "Get an estimate"], ["#submit", "Submit a case"], ["#results", "What the agent gives you"], ["#ask", "Ask the agent"], ["#broker", "Broker follow-up"], ["#decision", "Approve or decline"], ["#triage", "The queue"], ["#quotes", "Quote requests"], ["#workspace", "Overview and settings"]] },
  { group: "Reference", items: [["#models", "Models and rules"], ["#statuses", "Case statuses"], ["#limits", "Where the lines are"], ["#api", "API"]] },
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
        <h1 id="introduction">How to use Astra Risk</h1>
        <p className="lede">Astra Risk is an AI assistant for insurance work. Describe what you need in plain language and it does the reading, checking, and explaining; a person makes every final call.</p>
        <p>There are two ways in:</p>
        <ul>
          <li><strong><Link href="/quote">Get an estimate</Link></strong> is public. Chat with the assistant about tenant or car insurance and get a price range, the reasons behind it, and the questions that would tighten it.</li>
          <li><strong><Link href="/overview">The workspace</Link></strong> is for underwriters. Hand it a broker&apos;s commercial property submission and the agent reads the notes, checks them against the carrier appetite, asks the broker when something is missing, and writes a brief for you to approve or decline. It can also rank the live Federato queue.</li>
        </ul>
        <div className="notice"><Info size={17} aria-hidden="true" />Estimates come from demo rate tables and cases use the supplied 2025 commercial property appetite. Quoting and binding stay with the carrier.</div>

        <h2 id="estimate">Get an estimate</h2>
        <p>Open <Link href="/quote">Get an estimate</Link>. It is open to anyone. Type what you know in your own words, for example:</p>
        <pre className="code-block"><code>I rent an apartment in Toronto, my things are worth about $20,000, no claims.</code></pre>
        <p>The assistant replies with:</p>
        <ul>
          <li><strong>A price range</strong> per month and per year, in Canadian dollars.</li>
          <li><strong>What affects the price</strong>: each factor it used and whether it pushed the price up, down, or left it alone.</li>
          <li><strong>What it assumed</strong> to fill the gaps, so you can correct it.</li>
          <li><strong>Questions</strong>, each with a one-line reason it is being asked.</li>
        </ul>
        <p>If your message leaves the product open, it asks first: tenant insurance or car insurance. If something required is missing, it asks for that before showing a price.</p>
        <p>Answer the questions with the dropdowns and fields under the estimate and select <strong>Update estimate</strong>. Everything you have already said is remembered, so each question comes up once. You can also keep typing; new messages add to what the assistant already knows.</p>
        <p>Some situations need a person. Three or more claims, unusually high-value contents, classic or very expensive vehicles, and provinces where basic auto insurance comes from the public insurer (British Columbia, Saskatchewan, Manitoba) all end with a next step in place of a price. The assistant tells you why and what to do next.</p>
        <p>The line at the bottom of each reply names which model read your message. Only the facts it understood are saved.</p>

        <h2 id="submit">Submit a case</h2>
        <p>Sign in with an approved Google account, then choose <strong>Create case</strong> in the sidebar or <strong>Create a submission</strong> on the overview page.</p>
        <ol>
          <li><strong>Pick a sample or start blank.</strong> The sample menu has five ready-made submissions: an acceptable risk, territory and age referrals, a loss referral, a case that needs broker follow-up, and one with full appetite evidence. Use them to see each outcome without typing anything.</li>
          <li><strong>Fill in the insured.</strong> Name, state, total insured value, and, if you have them, the oldest building year and historical loss count.</li>
          <li><strong>Add carrier appetite evidence</strong> where you know it: new or renewal business, line, premium, eligible construction percentage, five-year loss dollars, and policy dates. Leave anything unknown blank. The agent asks the broker for it.</li>
          <li><strong>Add the property address</strong> if you have it, and the agent pulls a dozen public datasets on the location. <strong>Paste the broker&apos;s notes.</strong> Unstructured text is fine. Optionally add a public URL about the property and the agent will visit it for extra evidence.</li>
          <li>Select <strong>Start analysis</strong>.</li>
        </ol>
        <p>The case page opens straight away and updates on its own. While the agent works you see which stage it is on, what it is looking for, and a running commentary of what it just did and why that matters. A typical case takes under a minute.</p>

        <h2 id="results">What the agent gives you</h2>
        <p>When analysis finishes, the case page shows:</p>
        <table className="docs-table"><thead><tr><th>Section</th><th>What it tells you</th></tr></thead><tbody>
          <tr><td>Brief</td><td>A short, plain-language summary of the risk that leads with anything you should look at.</td></tr>
          <tr><td>Appetite recommendation</td><td>A match score out of 100 against the carrier appetite, a priority score for the queue, and the suggested next step.</td></tr>
          <tr><td>Listen to brief</td><td>The same brief read aloud, when the voice integration is on.</td></tr>
          <tr><td>Activity trace</td><td>Every step the agent took, in order: intake, both reads of the notes, public research, guideline checks, broker follow-ups, and review actions.</td></tr>
          <tr><td>Extracted facts</td><td>State, insured value, year built, and loss count, each with where it came from and how confident the agent is. Facts are read twice by independent methods, and a disagreement between the reads becomes a finding of its own.</td></tr>
          <tr><td>Carrier appetite checks</td><td>Eight checks: primary risk state, total insured value, building age, total premium, submission type, line of business, construction mix, and five-year loss value. Each is <strong>pass</strong>, <strong>refer</strong>, or <strong>unknown</strong>, with the evidence and rule behind it.</td></tr>
          <tr><td>Public-source evidence</td><td>A cited excerpt from the URL you supplied, shown as context for you to verify.</td></tr>
          <tr><td>Public property records</td><td>With a property address, the agent pulls the public record: FEMA flood zone, wildfire history, USGS seismicity, ten years of weather and the elevation from Open-Meteo, fire stations, hydrants and neighbouring hazards from OpenStreetMap, EPA-regulated sites, the Census tract, US Drought Monitor, and federal disaster declarations. Each becomes a cited finding, and the hazards move the priority score by a stated number of points, listed line by line beside the appetite score.</td></tr>
        </tbody></table>
        <p>A <strong>refer</strong> means an underwriter should take a look. An <strong>unknown</strong> is a question for the broker.</p>

        <h2 id="ask">Ask the agent</h2>
        <p>Under the analysis there is a small conversation box. Type a question, or open <strong>Voice</strong> and just talk: the mic stays live, a pause ends your turn, the reply plays straight back with the transcript running alongside. Either way the agent answers from the case record: which check to start with, where a fact came from, what it would ask the broker, how the public source lines up with the notes. Replies name their source and confidence when that matters. With <strong>Speak replies</strong> on, each answer is read aloud as well as written.</p>
        <p>The conversation lives on the page while you keep it open. The case record stays as it is; broker replies and decisions still go through the forms below.</p>

        <h2 id="broker">Broker follow-up</h2>
        <p>If a required fact is missing, the case pauses at <strong>Waiting for broker</strong> and the page shows the exact question to send. When the broker answers, paste their reply into <strong>Broker response</strong> and select <strong>Add response and resume</strong>. The agent re-reads the submission with the new information, re-runs every check, and produces a fresh brief.</p>
        <p>Paused cases keep their place. If a day passes with the broker still quiet, the trace notes that the follow-up is due. Sending the reminder is up to you.</p>

        <h2 id="decision">Approve or decline</h2>
        <p>When a case reaches <strong>Ready for review</strong>, write your rationale under <strong>Underwriter decision</strong> and choose <strong>Approve review</strong> or <strong>Decline</strong>. The decision and your reasoning are recorded on the case permanently and appear in the trace. Approving a review is a recommendation for the file. Quoting and binding happen in the carrier's own systems.</p>

        <h2 id="triage">The queue</h2>
        <p>Open <Link href="/triage">Queue</Link>. The last ranked queue loads straight away, and <strong>Rank again</strong> reads the live Federato API in about fifteen seconds: it discovers the fields the API exposes, reads every submission and each uniquely linked policy, and scores all of them against the same appetite the cases use.</p>
        <p>Every row carries the carrier&apos;s own vocabulary. <strong>Target</strong> fits the target band on state, insured value, premium, and building age. <strong>Acceptable</strong> fits appetite on all eight factors with at least one outside the target band. <strong>Needs information</strong> has open answers; the row names each one, where it comes from, and what the submission becomes once they land. <strong>Outside appetite</strong> has an exception on at least one factor and says which, with the figure. The queue orders itself the same way: verified matches, then open answers, then exceptions.</p>
        <p>Filter by line of business and disposition with the chips. <strong>Open as case</strong> turns a row into a case: every verified fact goes in as evidence, every open answer stays blank so the agent asks the broker for it, and the case remembers its place in the queue. <strong>Evidence and sources</strong> shows the points on every factor and where each value came from, and <strong>How the queue was read</strong> shows the queries the agent ran and why. <strong>More</strong> holds the slide deck and print options.</p>

        <h2 id="models">Models and rules</h2>
        <p>Rules decide; models read. Every appetite disposition comes from a deterministic engine that applies the carrier&apos;s thresholds, so the same evidence always gives the same answer and every factor cites its source. Language models do the reading: they pull the construction year and the loss count out of broker prose, and two independent reads plus a parser have to agree before a value is used. The <Link href="/scorecard">model scorecard</Link> measures each reader on the same broker notes: accuracy, invented values, latency, and cost.</p>

        <h2 id="quotes">Quote requests</h2>
        <p>Every conversation on the public estimate page lands in <Link href="/quotes">Quotes</Link> as one evolving record: the product and province, the estimate or referral it ended with, how many turns it took, which model read the messages, and the facts the assistant heard. The header counts how many are waiting for an advisor. The list refreshes on its own.</p>

        <h2 id="workspace">Overview and settings</h2>
        <p><Link href="/overview">Overview</Link> shows how many cases are in analysis, waiting on a broker, or ready for review, plus shortcuts, recent cases, agent quality over the last 30 days, and a chart of submissions by day. <Link href="/cases">Cases</Link> lists everything; filter by insured, state, or status. <Link href="/settings">Settings</Link> switches between light and dark themes; the choice is saved in your browser.</p>

        <h2 id="statuses">Case statuses</h2>
        <p>A case is always in exactly one of these states.</p>
        <table className="docs-table"><thead><tr><th>Status</th><th>Meaning</th></tr></thead><tbody>
          <tr><td>Received</td><td>Submitted and queued for analysis.</td></tr>
          <tr><td>Extracting</td><td>The agent is reading the broker&apos;s notes and any replies.</td></tr>
          <tr><td>Checking guidelines</td><td>Facts are being tested against the carrier appetite.</td></tr>
          <tr><td>Waiting for broker</td><td>Something required is missing. The question is on the case.</td></tr>
          <tr><td>Ready for review</td><td>Checks are done. An underwriter decision is needed.</td></tr>
          <tr><td>Approved, Declined</td><td>Final. The rationale is stored on the case.</td></tr>
          <tr><td>Needs attention</td><td>Analysis could not finish. The reason is shown on the case.</td></tr>
        </tbody></table>

        <h2 id="limits">Where the lines are</h2>
        <ul>
          <li>Every estimate is a demo range and every case ends with a human decision. Quoting and binding stay with the carrier.</li>
          <li>Public research goes to the one URL you supply and to open government datasets for the address you give. Every figure comes back with a link to the record it was read from.</li>
          <li>Follow-up questions are written for you to send; the agent stays off email and messaging.</li>
          <li>On the estimate page, only the facts the assistant understood are kept.</li>
          <li>The activity trace records what the agent did and when, in the agent&apos;s own words on the page.</li>
        </ul>

        <h2 id="api">API</h2>
        <p>Everything the workspace does goes through a small JSON API on the same origin, so you can drive it from your own tools. Errors come back as <code>{"{ \"error\": string }"}</code>.</p>
        <Endpoint method="POST" path="/api/quote" id="quote-api" />
        <p>Send <code>text</code> and any <code>answers</code> with a <code>quoteId</code>; get back the facts heard, the estimate or next step, and the questions.</p>
        <Endpoint method="GET" path="/api/cases" id="list-cases" />
        <p>The most recent cases, newest first.</p>
        <Endpoint method="POST" path="/api/cases" id="create-case" />
        <p>Start a case with the same fields as the submission form. Returns the new case ID.</p>
        <Endpoint method="GET" path="/api/cases/{id}" id="get-case" />
        <p>The case, its activity trace, and whether a voice brief is available.</p>
        <Endpoint method="POST" path="/api/cases/{id}/actions" id="case-actions" />
        <p>Deliver a broker response (<code>kind: "broker_response"</code>) or a decision (<code>kind: "approve" | "decline"</code>) with a reason. Include a client-generated <code>id</code> so a retry is safe.</p>
        <Endpoint method="GET" path="/api/cases/{id}/audio" id="case-audio" />
        <p>The review brief as spoken audio.</p>
        <Endpoint method="POST" path="/api/cases/{id}/chat" id="case-chat" />
        <p>Ask the agent about a case. Send <code>text</code> with the recent <code>history</code>, or a multipart <code>audio</code> recording to be transcribed first; set <code>voice</code> to get the reply back as MP3 too.</p>
        <Endpoint method="POST" path="/api/triage" id="triage-api" />
        <p><code>POST</code> runs a live Federato ranking, stores it, and returns the full report; <code>GET</code> returns the last stored report.</p>
      </article>
    </div>
  );
}
