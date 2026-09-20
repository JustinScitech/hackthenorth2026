import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parseBrokerNotes, type Extracted } from "../src/agent/analysis";
import { extractNotes, type ModelAttempt } from "../src/agent/model";
import { extractionCases } from "../evals/suites/extraction";
import { priceFor } from "../evals/pricing";
import { same, sleep } from "../evals/runner";

/**
 * `npm run eval:scorecard` runs every reader over the same golden broker notes and writes
 * evals/scorecards/extraction.json for the /scorecard page: accuracy, invented values, latency,
 * tokens, and list-price cost. Rules decide the appetite; this measures the part that reads.
 */
type ReaderId = "parser" | "gemini-only" | "openai-only" | "pipeline";
type Failure = { name: string; expected: Extracted; actual: Extracted | null; note?: string };
export type ReaderScore = {
  id: ReaderId; label: string; model: string | null; available: boolean; reason?: string;
  passed: number; total: number; accuracy: number; hallucinated: number; missed: number; wrong: number; noResult: number;
  latencyMs: { p50: number; p95: number; mean: number } | null;
  tokens: { input: number; output: number } | null;
  costPer1kNotes: number | null; priceSource: string | null;
  /** Model calls that completed, and refusals or failures by code, so a quota-limited run reads as one. */
  modelCalls: number; errors: Record<string, number>;
  failures: Failure[];
};
export type Scorecard = { generatedAt: string; notes: number; delayMs: number; readers: ReaderScore[] };

const readers: { id: ReaderId; label: string; needs: string[] }[] = [
  { id: "parser", label: "Deterministic parser", needs: [] },
  { id: "gemini-only", label: "Gemini alone", needs: ["GEMINI_API_KEY"] },
  { id: "openai-only", label: "OpenAI alone", needs: ["OPENAI_API_KEY"] },
  { id: "pipeline", label: "Models and parser, resolved by agreement", needs: ["GEMINI_API_KEY", "OPENAI_API_KEY"] },
];

const percentile = (values: number[], p: number) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : 0; };
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

async function read(id: ReaderId, notes: string): Promise<{ actual: Extracted | null; ms: number; attempt: ModelAttempt | null; attempts: ModelAttempt[] }> {
  const started = performance.now();
  if (id === "parser") return { actual: parseBrokerNotes(notes), ms: performance.now() - started, attempt: null, attempts: [] };
  const result = await extractNotes(notes);
  const ms = performance.now() - started;
  if (id === "pipeline") return { actual: result.extracted, ms, attempt: result.attempts.find((attempt) => attempt.status === "completed") ?? null, attempts: result.attempts };
  const source = id === "openai-only" ? "OpenAI" : "Gemini";
  const attempt = result.attempts.find((attempt) => attempt.source === source && attempt.status === "completed") ?? null;
  return { actual: attempt?.value ?? null, ms: attempt?.durationMs ?? ms, attempt, attempts: result.attempts };
}

async function score(id: ReaderId, label: string, delayMs: number, log: (line: string) => void): Promise<ReaderScore> {
  const latencies: number[] = [];
  const tokens = { input: 0, output: 0, counted: 0 };
  const failures: Failure[] = [];
  const models = new Map<string, number>();
  const errors: Record<string, number> = {};
  let passed = 0, hallucinated = 0, missed = 0, wrong = 0, noResult = 0, modelCalls = 0;
  for (const [index, item] of extractionCases.entries()) {
    if (id !== "parser" && index > 0) await sleep(delayMs);
    const { actual, ms, attempt, attempts } = await read(id, item.notes);
    latencies.push(ms);
    for (const used of id === "pipeline" ? attempts.filter((entry) => entry.status === "completed") : attempt ? [attempt] : []) {
      models.set(used.model, (models.get(used.model) ?? 0) + 1);
      modelCalls++;
      if (used.usage) { tokens.input += used.usage.input; tokens.output += used.usage.output; tokens.counted++; }
    }
    for (const failed of attempts.filter((entry) => entry.status === "failed" && (id === "pipeline" || entry.source === (id === "openai-only" ? "OpenAI" : "Gemini")))) {
      const key = failed.errorCode ? `HTTP ${failed.errorCode}` : "invalid or empty response";
      errors[key] = (errors[key] ?? 0) + 1;
    }
    if (actual) {
      for (const field of ["yearBuilt", "losses"] as const) {
        if (item.expected[field] === null && actual[field] !== null) hallucinated++;
        else if (item.expected[field] !== null && actual[field] === null) missed++;
        else if (actual[field] !== item.expected[field]) wrong++;
      }
    } else noResult++;
    const ok = actual !== null && same(actual, item.expected);
    if (ok) passed++; else failures.push({ name: item.name, expected: item.expected, actual, note: item.note });
    log(`${ok ? "PASS" : "FAIL"} ${label} · ${item.name} · ${Math.round(ms)}ms`);
  }
  const model = [...models.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (id === "parser" ? "regex parser" : null);
  const price = id === "parser" ? { input: 0, output: 0, source: "runs in-process" } : priceFor(model);
  const perNote = tokens.counted ? { input: tokens.input / tokens.counted, output: tokens.output / tokens.counted } : null;
  return {
    id, label, model, available: true,
    passed, total: extractionCases.length, accuracy: round(passed / extractionCases.length, 4), hallucinated, missed, wrong, noResult,
    latencyMs: { p50: round(percentile(latencies, 50)), p95: round(percentile(latencies, 95)), mean: round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) },
    tokens: perNote ? { input: round(perNote.input), output: round(perNote.output) } : null,
    costPer1kNotes: price && perNote ? round(((perNote.input * price.input + perNote.output * price.output) / 1_000_000) * 1000 * (id === "pipeline" ? tokens.counted / extractionCases.length : 1), 4) : id === "parser" ? 0 : null,
    priceSource: price?.source ?? null,
    modelCalls, errors,
    failures,
  };
}

async function main() {
  const { values } = parseArgs({ options: { reader: { type: "string", multiple: true }, out: { type: "string" }, quiet: { type: "boolean" } } });
  const delayMs = Number(process.env.EVAL_MODEL_DELAY_MS ?? 5000);
  const log = values.quiet ? () => undefined : (line: string) => console.log(line);
  const selected = values.reader?.length ? readers.filter((reader) => values.reader!.includes(reader.id)) : readers;
  const results: ReaderScore[] = [];
  for (const reader of selected) {
    const missingKeys = reader.needs.filter((key) => !process.env[key]);
    const usable = reader.id === "pipeline" ? missingKeys.length < reader.needs.length : missingKeys.length === 0;
    if (!usable) {
      results.push({ id: reader.id, label: reader.label, model: null, available: false, reason: `${missingKeys.join(" and ")} unset on the machine that ran this`, passed: 0, total: extractionCases.length, accuracy: 0, hallucinated: 0, missed: 0, wrong: 0, noResult: extractionCases.length, latencyMs: null, tokens: null, costPer1kNotes: null, priceSource: null, modelCalls: 0, errors: {}, failures: [] });
      log(`SKIP ${reader.label}: ${missingKeys.join(", ")} unset`);
      continue;
    }
    if (reader.id === "gemini-only") { const saved = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY; results.push(await score(reader.id, reader.label, delayMs, log)); if (saved) process.env.OPENAI_API_KEY = saved; }
    else if (reader.id === "openai-only") { const saved = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY; results.push(await score(reader.id, reader.label, delayMs, log)); if (saved) process.env.GEMINI_API_KEY = saved; }
    else results.push(await score(reader.id, reader.label, delayMs, log));
  }
  const scorecard: Scorecard = { generatedAt: new Date().toISOString(), notes: extractionCases.length, delayMs, readers: results };
  const out = values.out ?? "evals/scorecards/extraction.json";
  mkdirSync("evals/scorecards", { recursive: true });
  writeFileSync(out, `${JSON.stringify(scorecard, null, 2)}\n`);
  console.log("");
  for (const reader of results) console.log(`${reader.label.padEnd(44)} ${reader.available ? `${reader.passed}/${reader.total} (${Math.round(reader.accuracy * 100)}%) invented ${reader.hallucinated} missed ${reader.missed} wrong ${reader.wrong} · p50 ${reader.latencyMs?.p50}ms p95 ${reader.latencyMs?.p95}ms · ${reader.costPer1kNotes === null ? "cost n/a" : `$${reader.costPer1kNotes.toFixed(3)} per 1k notes`} · ${reader.model ?? "no model call completed"}${Object.keys(reader.errors).length ? ` · refused: ${Object.entries(reader.errors).map(([code, count]) => `${count}× ${code}`).join(", ")}` : ""}` : `skipped: ${reader.reason}`}`);
  console.log(`\nScorecard written to ${out}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
