import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "@phosphor-icons/react/dist/ssr";
import scorecardJson from "../../../../evals/scorecards/extraction.json";

export const metadata: Metadata = { title: "Model scorecard", description: "How each reader scores on the same broker notes: accuracy, invented values, latency, and cost." };

/** Shape written by scripts/eval-scorecard.ts; older files may lack the refusal fields. */
type Reader = {
  id: string; label: string; model: string | null; available: boolean; reason?: string;
  passed: number; total: number; accuracy: number; hallucinated: number; missed: number; wrong: number; noResult: number;
  latencyMs: { p50: number; p95: number; mean: number } | null;
  tokens: { input: number; output: number } | null;
  costPer1kNotes: number | null; priceSource: string | null;
  modelCalls?: number; errors?: Record<string, number>;
  failures: { name: string; expected: Extracted; actual: Extracted | null; note?: string }[];
};
type Scorecard = { generatedAt: string; notes: number; delayMs: number; readers: Reader[] };
const scorecard = scorecardJson as unknown as Scorecard;
const percent = (value: number) => `${Math.round(value * 100)}%`;
const ms = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
const money = (value: number) => value === 0 ? "$0" : value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
const show = (value: Extracted) => `year ${value.yearBuilt ?? "none"}, losses ${value.losses ?? "none"}`;
type Extracted = { yearBuilt: number | null; losses: number | null };

function Row({ reader }: { reader: Reader }) {
  if (!reader.available) return <tr><th scope="row">{reader.label}</th><td colSpan={7} className="subtle">Skipped: {reader.reason}.</td></tr>;
  const refused = Object.entries(reader.errors ?? {}).map(([code, count]) => `${count} × ${code}`).join(", ");
  return <tr>
    <th scope="row">{reader.label}<small>{reader.model ?? "no model call completed"}{reader.id === "pipeline" && (reader.modelCalls ?? 0) === 0 ? "; the parser supplied every value" : ""}</small>{refused && <small>{reader.noResult} of {reader.total} notes got no model result ({refused})</small>}</th>
    <td>{percent(reader.accuracy)}<small>{reader.passed} of {reader.total}</small></td>
    <td>{reader.hallucinated}</td>
    <td>{reader.missed}</td>
    <td>{reader.wrong}</td>
    <td>{reader.latencyMs ? ms(reader.latencyMs.p50) : "—"}</td>
    <td>{reader.latencyMs ? ms(reader.latencyMs.p95) : "—"}</td>
    <td>{reader.costPer1kNotes === null ? "—" : money(reader.costPer1kNotes)}{reader.tokens && <small>{reader.tokens.input} in · {reader.tokens.output} out per note</small>}</td>
  </tr>;
}

export default function ScorecardPage() {
  const ran = scorecard.readers.filter((reader) => reader.available);
  return (
    <main className="shell scorecard">
      <p className="eyebrow">Evaluation</p>
      <h1>Model scorecard</h1>
      <p className="lede">Rules decide; models read. Every appetite disposition in Astra Risk comes from a deterministic engine that applies the carrier&apos;s thresholds, so the same evidence always gives the same answer and every factor cites its source. Language models do the reading: they pull the construction year and the three-year loss count out of broker prose. This page measures each reader on the same {scorecard.notes} broker notes.</p>
      <div className="notice"><Info size={17} aria-hidden="true" /><span>Invented values are the failure that matters most: a year or a loss count that the note never stated. Missed values cost a broker question; wrong values cost a wrong check.</span></div>
      {scorecard.readers.some((reader) => reader.available && reader.noResult > 0) && <div className="notice"><Info size={17} aria-hidden="true" /><span>This run hit API refusals, so the model rows understate what the model can read. The refusal counts sit under each reader; rerun <code>npm run eval:scorecard</code> once the quota resets.</span></div>}
      <div className="card">
        <div className="triage-table-wrap" style={{ paddingTop: 16 }}>
          <table className="triage-table scorecard-table">
            <thead><tr><th>Reader</th><th>Accuracy</th><th>Invented</th><th>Missed</th><th>Wrong</th><th>p50</th><th>p95</th><th>Cost per 1,000 notes</th></tr></thead>
            <tbody>{scorecard.readers.map((reader) => <Row key={reader.id} reader={reader} />)}</tbody>
          </table>
        </div>
      </div>
      <p className="subtle" style={{ marginTop: 12 }}>Generated {new Date(scorecard.generatedAt).toLocaleString()} with {scorecard.delayMs} ms between model calls. Accuracy counts a note as correct only when both fields match what a careful underwriter would take from it. Cost uses published list prices per million tokens and the tokens each call reported; the parser runs in-process. Reproduce with <code>npm run eval:scorecard</code>; the cases live in <code>evals/suites/extraction.ts</code>.</p>
      <h2 style={{ marginTop: 32 }}>What each reader got wrong</h2>
      {ran.map((reader) => (
        <details key={reader.id} className="triage-plan popup">
          <summary>{reader.label}: {reader.failures.length} of {reader.total}</summary>
          <div className="triage-plan-body">
            {reader.failures.length === 0 && <p>Every note read correctly.</p>}
            <ul>{reader.failures.map((failure) => <li key={failure.name}><strong>{failure.name}</strong>: expected {show(failure.expected)}; got {failure.actual ? show(failure.actual) : "no result"}.{failure.note ? ` ${failure.note}` : ""}</li>)}</ul>
          </div>
        </details>
      ))}
      <p className="subtle" style={{ marginTop: 24 }}>The appetite engine itself is pinned by 189 offline cases that run in <code>npm test</code>; see <Link className="text-link" href="/docs#models">Models and rules</Link>.</p>
    </main>
  );
}
