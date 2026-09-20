import { z } from "zod";
import { extractEvidenceSignals } from "./enrichment";
import { geminiJson, geminiModels, type JsonResponse } from "./providers";
import type { EvidenceModelRun, EvidenceSignal } from "../lib/types";

/**
 * A second read of a fetched public page. Gemini extracts the same signal kinds
 * as the regex parser, each with the sentence it came from; a quote that is not
 * in the page text is treated as invented and dropped. The parser output is the
 * floor: the model can add and agree, and any disagreement becomes a conflict
 * for the underwriter instead of a replacement. Nothing here throws; a model
 * failure, timeout, or malformed reply leaves the parser result untouched.
 */
export type { EvidenceModelRun };
export type EvidenceExtraction = { signals: EvidenceSignal[]; conflicts: string[]; model: EvidenceModelRun };
export type EvidenceGenerate = (model: string, prompt: string, text: string) => Promise<JsonResponse>;

export const EVIDENCE_PROMPT = 'You read a public property record or listing for an insurance underwriter. Return only JSON matching {"signals": [{"kind": "yearBuilt"|"constructionType"|"floodZone"|"sprinklered"|"occupancy"|"squareFeet", "value": number|string|boolean, "quote": string}]}. Report only facts the page states explicitly, at most one signal per kind. "quote" must be an exact, verbatim sentence or fragment copied from the page text that states the fact; never paraphrase. yearBuilt is the original construction year, not an effective or renovation year. floodZone is the FEMA zone letter code. sprinklered is true or false. squareFeet is the building area as a number. Return {"signals": []} when the page states none of these.';

const KIND_LABELS: Record<EvidenceSignal["kind"], string> = { yearBuilt: "Year built", constructionType: "Construction type", floodZone: "Flood zone", sprinklered: "Sprinkler status", occupancy: "Occupancy", squareFeet: "Building size" };
const KINDS = Object.keys(KIND_LABELS) as EvidenceSignal["kind"][];

const replySchema = z.object({
  signals: z.array(z.object({ kind: z.string(), value: z.unknown(), quote: z.unknown() })).max(20),
});

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") { const parsed = Number(value.replace(/[,\s]/g, "")); return Number.isFinite(parsed) && value.trim() !== "" ? parsed : null; }
  return null;
};

/** Coerces one model value into the shape the parser produces for that kind, or null when it cannot be trusted. */
function normalizeValue(kind: EvidenceSignal["kind"], value: unknown): string | number | boolean | null {
  switch (kind) {
    case "yearBuilt": {
      const year = toNumber(value);
      return year !== null && Number.isInteger(year) && year >= 1800 && year <= new Date().getUTCFullYear() ? year : null;
    }
    case "squareFeet": {
      const area = toNumber(value);
      return area !== null && area > 0 && area < 100_000_000 ? Math.round(area) : null;
    }
    case "sprinklered": {
      if (typeof value === "boolean") return value;
      if (typeof value === "string" && /^(?:yes|true|y)$/i.test(value.trim())) return true;
      if (typeof value === "string" && /^(?:no|false|n)$/i.test(value.trim())) return false;
      return null;
    }
    case "floodZone": {
      const zone = typeof value === "string" ? value.trim().toUpperCase() : "";
      return /^(?:[AVX](?:[EHO]|99)?|B|C|D|AR)$/.test(zone) ? zone : null;
    }
    default: {
      const text = typeof value === "string" ? normalizeText(value) : "";
      return text.length > 0 && text.length <= 80 ? text : null;
    }
  }
}

/**
 * Validates a model reply against the page. Malformed JSON, unknown kinds,
 * impossible values, duplicate kinds, and quotes that are not verbatim page
 * text are dropped; `dropped` counts what the model offered and lost.
 */
export function parseModelSignals(raw: string | undefined, pageText: string): { signals: EvidenceSignal[]; dropped: number; malformed: boolean } {
  if (!raw) return { signals: [], dropped: 0, malformed: true };
  const body = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return { signals: [], dropped: 0, malformed: true }; }
  const reply = replySchema.safeParse(parsed);
  if (!reply.success) return { signals: [], dropped: 0, malformed: true };
  const page = normalizeText(pageText);
  const signals: EvidenceSignal[] = [];
  let dropped = 0;
  for (const item of reply.data.signals) {
    const kind = KINDS.find((known) => known === item.kind);
    const quote = typeof item.quote === "string" ? normalizeText(item.quote) : "";
    const value = kind ? normalizeValue(kind, item.value) : null;
    if (!kind || value === null || quote.length < 3 || quote.length > 300 || !page.includes(quote) || signals.some((signal) => signal.kind === kind)) { dropped += 1; continue; }
    signals.push({ kind, value, quote });
  }
  return { signals, dropped, malformed: false };
}

const sameValue = (left: string | number | boolean, right: string | number | boolean) =>
  typeof left === "string" && typeof right === "string"
    ? normalizeText(left).toLowerCase().replace(/[-_/]+/g, " ") === normalizeText(right).toLowerCase().replace(/[-_/]+/g, " ")
    : left === right;

/**
 * Resolves parser and model signals kind by kind, the way resolveField settles
 * a fact from several sources: agreement is recorded, the parser's value is
 * kept when they differ (with the difference reported), and a kind only the
 * model quoted is added and marked as model-read.
 */
export function mergeEvidenceSignals(parser: EvidenceSignal[], model: EvidenceSignal[]): { signals: EvidenceSignal[]; conflicts: string[] } {
  const signals: EvidenceSignal[] = [];
  const conflicts: string[] = [];
  for (const signal of parser) {
    const other = model.find((item) => item.kind === signal.kind);
    if (!other) { signals.push({ ...signal, agreement: "parser" }); continue; }
    if (sameValue(signal.value, other.value)) { signals.push({ ...signal, agreement: "both" }); continue; }
    signals.push({ ...signal, agreement: "parser" });
    conflicts.push(`${KIND_LABELS[signal.kind]} differs: Parser ${String(signal.value)}, Gemini ${String(other.value)}.`);
  }
  for (const signal of model) {
    if (!parser.some((item) => item.kind === signal.kind)) signals.push({ ...signal, agreement: "model" });
  }
  return { signals, conflicts };
}

const defaultGenerate: EvidenceGenerate = (model, prompt, text) => geminiJson(model, prompt, text, { timeoutMs: 30_000, retries: 2 });

/**
 * Parser first, then the model when Gemini is configured (or a generator is
 * injected). The page text is capped so one page cannot blow the token budget.
 */
export async function extractEvidence(pageText: string, generate?: EvidenceGenerate): Promise<EvidenceExtraction> {
  const parser = extractEvidenceSignals(pageText);
  const model = geminiModels()[0];
  if (!generate && !process.env.GEMINI_API_KEY) {
    return { ...mergeEvidenceSignals(parser, []), model: { source: "Gemini", model, status: "not_configured", durationMs: 0, dropped: 0 } };
  }
  const started = performance.now();
  try {
    const response = await (generate ?? defaultGenerate)(model, EVIDENCE_PROMPT, pageText.slice(0, 20_000));
    if (!response.text) throw new Error("Empty model response");
    const read = parseModelSignals(response.text, pageText);
    if (read.malformed) throw new Error("Model reply was not the expected JSON");
    return { ...mergeEvidenceSignals(parser, read.signals), model: { source: "Gemini", model: response.modelVersion || model, status: "completed", durationMs: Math.round(performance.now() - started), dropped: read.dropped } };
  } catch (error) {
    console.warn("Gemini evidence pass unavailable", model, error instanceof Error ? error.name : "UnknownError");
    return { ...mergeEvidenceSignals(parser, []), model: { source: "Gemini", model, status: "failed", durationMs: Math.round(performance.now() - started), dropped: 0 } };
  }
}
