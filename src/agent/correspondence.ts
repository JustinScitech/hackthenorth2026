import { z } from "zod";
import { brokerAppetiteInstructions, type CaseAppetite } from "../lib/case-appetite";
import type { CaseRecord, Finding } from "../lib/types";
import { shouldFallThroughGeminiError } from "./model";
import { errorCode, geminiJson, geminiModels, type JsonResponse } from "./providers";

/**
 * Broker correspondence: the email that asks for what the appetite review still needs. Gemini
 * drafts it when a key is present; the existing template question is the deterministic path. A
 * model that fails, times out, returns malformed JSON, invents a figure, or skips a missing item
 * never fails the case job; the template is used and the reason is recorded.
 *
 * The broker's reply needs no reader of its own: extraction runs the full appetite schema over
 * the joined submission and replies (see extraction-schema.ts), and resolveCaseAppetite keeps an
 * explicit "Field: value" reply line as the floor over what the readers took from the prose.
 */
export type Generate = (model: string, prompt: string, text: string) => Promise<JsonResponse>;
export type ModelEvent = { event: "started" | "completed" | "failed"; model: string; durationMs: number; errorCode?: number };
export type CorrespondenceOptions = {
  /** Model call to use instead of Gemini (tests and evals); `null` means no model is configured. */
  generate?: Generate | null;
  models?: readonly string[];
  onEvent?: (event: ModelEvent) => Promise<void> | void;
  timeoutMs?: number;
};

export type DraftCase = Pick<CaseRecord, "state" | "tiv" | "yearBuilt" | "losses"> & { insuredName?: string; appetite?: Partial<CaseAppetite> | null; notes?: string };
export type BrokerDraft = { text: string; source: "model" | "template"; model?: string; durationMs: number; fallbackReason?: string };

const money = (value: number) => `$${value.toLocaleString("en-US")}`;

/** The question the case has always asked; the draft falls back to it whenever the model cannot be trusted. */
export function templateBrokerEmail(missing: string[]): string {
  return `Please provide or clarify: ${missing.join(", ")}. ${brokerAppetiteInstructions}`;
}

/** Everything the model may draw on, as plain lines. Doubles as the allow-list for figures in the draft. */
export function draftContext(caseRecord: DraftCase, missing: string[], findings: Finding[]): string {
  const appetite = Object.entries(caseRecord.appetite ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== false).map(([key, value]) => `${key} ${typeof value === "number" ? value.toLocaleString("en-US") : String(value)}`);
  return [
    `Insured: ${caseRecord.insuredName || "not supplied"}`,
    `Risk state: ${caseRecord.state ?? "not supplied"}`,
    `Total insured value: ${caseRecord.tiv === null ? "not supplied" : money(caseRecord.tiv)}`,
    `Year built on the form: ${caseRecord.yearBuilt ?? "not supplied"}`,
    `Loss count on the form: ${caseRecord.losses ?? "not supplied"}`,
    `Appetite fields already supplied: ${appetite.length ? appetite.join("; ") : "none"}`,
    `MISSING: ${missing.join("; ")}`,
    "Findings:",
    ...findings.map((finding) => `- ${finding.label}: ${finding.result}. ${finding.detail}`),
    "Broker notes:",
    caseRecord.notes?.trim() || "(no notes)",
  ].join("\n");
}

const DRAFT_PROMPT = [
  "You write the underwriter's email to the broker who submitted the commercial property case below. The appetite review is paused because the items under MISSING are not established.",
  "Write one short email (under 170 words, plain text, no subject line, no markdown) that: opens with the insured's name; asks for every item under MISSING, naming each one and saying in a clause why the review needs it; where the broker's notes touch on an item, cites the note in the broker's own words (for example: \"Your note mentions a 2019 water claim but no dollar figure — can you send the five-year loss run?\"); uses only figures, dates and years that appear in the notes or facts below and never invents an amount, date, count or deadline; does not quote the carrier's internal thresholds, scores or points; and closes by saying a plain reply is fine.",
  'Return only JSON: {"email": string}.',
].join(" ");

const draftSchema = z.object({ email: z.string().trim().min(20).max(4000) });

/** How each missing item may be referred to in prose; the label itself always counts. */
const mentions: Record<string, RegExp> = {
  "account name": /account|insured/i,
  "effective date": /effective|inception|policy (?:period|term|dates?)|start date/i,
  "expiration date": /expir|policy (?:period|term|dates?)|end date/i,
  "valid effective/expiration date order": /effective|expir|policy (?:period|term|dates?)/i,
  "Submission type": /new business|renewal|submission type|business type/i,
  "Line of business": /line of business|coverage line|\bline\b/i,
  "Primary risk state": /\bstate\b/i,
  "Total insured value": /insured value|\bTIV\b|total insured/i,
  "Total premium": /premium/i,
  "Building age": /year built|year of construction|built in|the year .{0,30}built|constructed|construction year|building age|how old/i,
  "Construction mix": /construction (?:mix|type|class|percent|share|material)|eligible construction|joisted masonry|non-?combustible|masonry|steel|frame/i,
  "Five-year loss value": /loss|claim/i,
};

/** Missing items the text never refers to, by label or by the plain words a broker would use. */
export function unmentionedFields(text: string, missing: string[]): string[] {
  return missing.filter((label) => !text.toLowerCase().includes(label.toLowerCase()) && !(mentions[label]?.test(text)));
}

type NumericToken = { raw: string; value: number; figure: boolean };
const suffixes: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6, bn: 1e9, billion: 1e9 };

/**
 * Numbers in prose. A token is a "figure" when it could mislead an underwriter: money,
 * a percentage, a k/m/million amount, a year, or anything a thousand or more. Small counts
 * ("2 claims", the "0-100" in the reply instructions) are not.
 */
function numericTokens(text: string): NumericToken[] {
  const tokens: NumericToken[] = [];
  for (const match of text.matchAll(/(\$)?(\d(?:[\d,]*\d)?(?:\.\d+)?)\s?(%|k|mm|m|bn|billion|million|thousand)?(?![\w])/gi)) {
    const [raw, dollar, digits, suffix] = match;
    const unit = suffix?.toLowerCase();
    const value = Number(digits.replace(/,/g, "")) * (unit && unit !== "%" ? suffixes[unit] : 1);
    if (!Number.isFinite(value)) continue;
    tokens.push({ raw: raw.trim(), value, figure: Boolean(dollar || unit) || value >= 1000 });
  }
  return tokens;
}

/** Figures in `text` whose value appears nowhere in `context`: what a draft must never contain. */
export function inventedFigures(text: string, context: string): string[] {
  const known = new Set(numericTokens(context).map((token) => token.value));
  return [...new Set(numericTokens(text).filter((token) => token.figure && !known.has(token.value)).map((token) => token.raw))];
}

type Attempt = { status: "not_configured" | "completed" | "failed"; model: string; durationMs: number; errorCode?: number; text?: string };

/**
 * Walks the Gemini waterfall the way the case chat does: the next model after a server-side
 * failure or a per-model quota error (a demo key often has one model's daily allowance spent
 * while another answers), a stop on auth or bad-request errors.
 */
async function runModel(prompt: string, text: string, options: CorrespondenceOptions): Promise<Attempt> {
  const models = options.models ?? geminiModels();
  const generate: Generate | null = options.generate === undefined
    ? (process.env.GEMINI_API_KEY ? (model, system, body) => geminiJson(model, system, body, { retries: 1, timeoutMs: options.timeoutMs ?? 20_000 }) : null)
    : options.generate;
  if (!generate) return { status: "not_configured", model: models[0] ?? "none", durationMs: 0 };
  let last: Attempt = { status: "failed", model: models[0] ?? "none", durationMs: 0 };
  for (const model of models) {
    const started = performance.now();
    await options.onEvent?.({ event: "started", model, durationMs: 0 });
    try {
      const response = await generate(model, prompt, text);
      if (!response.text) throw new Error("Empty model response");
      last = { status: "completed", model: response.modelVersion || model, durationMs: Math.round(performance.now() - started), text: response.text };
      await options.onEvent?.({ event: "completed", model: last.model, durationMs: last.durationMs });
      return last;
    } catch (error) {
      last = { status: "failed", model, durationMs: Math.round(performance.now() - started), errorCode: errorCode(error) };
      console.warn("Gemini correspondence unavailable", model, error instanceof Error ? error.name : "UnknownError");
      await options.onEvent?.({ event: "failed", model, durationMs: last.durationMs, errorCode: last.errorCode });
      if (!shouldFallThroughGeminiError(error)) break;
    }
  }
  return last;
}

/**
 * Drafts the email asking the broker for the missing items. The model's draft is used only when it
 * names every missing item and contains no figure absent from the case; otherwise the template
 * question is returned with the reason, so the underwriter always has something to approve.
 */
export async function draftBrokerEmail(caseRecord: DraftCase, missing: string[], findings: Finding[], options: CorrespondenceOptions = {}): Promise<BrokerDraft> {
  const template = templateBrokerEmail(missing);
  const context = draftContext(caseRecord, missing, findings);
  const attempt = await runModel(DRAFT_PROMPT, context, options);
  if (attempt.status === "not_configured") return { text: template, source: "template", durationMs: 0 };
  if (attempt.status === "failed") return { text: template, source: "template", model: attempt.model, durationMs: attempt.durationMs, fallbackReason: `Model unavailable${attempt.errorCode ? ` (${attempt.errorCode})` : ""}` };
  let email: string;
  try {
    email = draftSchema.parse(JSON.parse(attempt.text ?? "")).email;
  } catch {
    return { text: template, source: "template", model: attempt.model, durationMs: attempt.durationMs, fallbackReason: "Model returned malformed JSON" };
  }
  const unmentioned = unmentionedFields(email, missing);
  if (unmentioned.length) return { text: template, source: "template", model: attempt.model, durationMs: attempt.durationMs, fallbackReason: `Model draft did not ask for ${unmentioned.join(", ")}` };
  const invented = inventedFigures(email, context);
  if (invented.length) return { text: template, source: "template", model: attempt.model, durationMs: attempt.durationMs, fallbackReason: `Model draft invented ${invented.join(", ")}` };
  return { text: email, source: "model", model: attempt.model, durationMs: attempt.durationMs };
}
