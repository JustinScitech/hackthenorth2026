import { z } from "zod";
import { brokerAppetite, caseAppetiteSchema, type CaseAppetite } from "../lib/case-appetite";
import { parseBrokerNotes } from "./analysis";
import { resolveField, type FieldCandidate, type FieldValue, type Resolved, type SourceKind } from "./resolution";

/**
 * The whole fact schema a reader (model or parser) fills from broker text:
 * every carrier appetite field plus the construction year and three-year
 * claim count. Each field is read as {value, quote}, where the quote is the
 * verbatim sentence or line the value came from and null means the text does
 * not state it. Malformed fields are dropped one at a time so a single bad
 * value never costs the rest of a reading, and a quote that is not actually
 * in the text is discarded so the case page never shows an invented citation.
 */
export type ExtractedFields = {
  yearBuilt: number | null;
  losses: number | null;
  business: CaseAppetite["business"];
  line: CaseAppetite["line"];
  premium: CaseAppetite["premium"];
  constructionPercent: CaseAppetite["constructionPercent"];
  lossValue: CaseAppetite["lossValue"];
  lossHistoryComplete: boolean | null;
  effective: CaseAppetite["effective"];
  expiration: CaseAppetite["expiration"];
};
export type ExtractionField = keyof ExtractedFields;
export type AppetiteField = Exclude<ExtractionField, "yearBuilt" | "losses">;
export type FieldReading<F extends ExtractionField> = { value: ExtractedFields[F]; quote: string | null };
export type Reading = { [F in ExtractionField]: FieldReading<F> };
export type ResolvedFields = { [F in ExtractionField]: Resolved<NonNullable<ExtractedFields[F]>> };

export const EXTRACTION_FIELDS = ["yearBuilt", "losses", "business", "line", "premium", "constructionPercent", "lossValue", "lossHistoryComplete", "effective", "expiration"] as const satisfies readonly ExtractionField[];
export const APPETITE_FIELDS = ["business", "line", "premium", "constructionPercent", "lossValue", "lossHistoryComplete", "effective", "expiration"] as const satisfies readonly AppetiteField[];

export const FIELD_LABELS: Record<ExtractionField, string> = {
  yearBuilt: "Year built", losses: "Recent loss count", business: "Business type", line: "Line of business", premium: "Premium",
  constructionPercent: "Eligible construction percent", lossValue: "Five-year loss value", lossHistoryComplete: "Five-year history complete",
  effective: "Effective date", expiration: "Expiration date",
};

export const EXTRACTION_PROMPT = [
  "You extract facts for a commercial property underwriting review from broker text. Return only a JSON object with exactly these keys: yearBuilt, losses, business, line, premium, constructionPercent, lossValue, lossHistoryComplete, effective, expiration.",
  'Each key maps to {"value": ..., "quote": ...}. "value" is the fact, or null when the text does not state it. "quote" is the single sentence or line of the broker text that states the value, copied verbatim and unchanged; it is null whenever value is null.',
  "Never infer, estimate, compute, or convert a value: if the text does not state it, value and quote are both null.",
  "yearBuilt: integer year the building was originally constructed; renovation, roof, retrofit, and appraisal years are not it, and when several buildings are listed use the oldest.",
  "losses: integer count of losses or claims in the past three years; a count over a different window, a dollar amount, or a claim reference number is not it.",
  'business: "new" or "renewal". line: the line of business in lowercase, for example "property".',
  "premium: total annual premium in USD as a number. constructionPercent: eligible construction percent as a number from 0 to 100. lossValue: five-year loss value in USD as a number; a claim count is never a dollar value.",
  "lossHistoryComplete: true or false only when the text states whether the five-year loss history is complete.",
  'effective and expiration: policy dates as "YYYY-MM-DD", only when the text gives a full calendar date.',
  "Later broker updates supersede earlier details.",
].join(" ");

const thisYear = new Date().getFullYear();
const valueSchemas: Record<ExtractionField, z.ZodTypeAny> = {
  yearBuilt: z.number().int().min(1800).max(thisYear),
  losses: z.number().int().min(0).max(1000),
  business: caseAppetiteSchema.shape.business,
  line: caseAppetiteSchema.shape.line,
  premium: caseAppetiteSchema.shape.premium,
  constructionPercent: caseAppetiteSchema.shape.constructionPercent,
  lossValue: caseAppetiteSchema.shape.lossValue,
  lossHistoryComplete: z.boolean(),
  effective: caseAppetiteSchema.shape.effective,
  expiration: caseAppetiteSchema.shape.expiration,
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const normalizeSpace = (text: string) => text.replace(/\s+/g, " ").trim();
const MAX_QUOTE = 600;

/** Accepts {value, quote} or a bare value; lower-cases the enum-like fields so "NEW" and "Property" match the parser's reading. */
function fieldReading<F extends ExtractionField>(field: F): z.ZodType<FieldReading<F>> {
  const shape = z.object({ value: valueSchemas[field].nullable(), quote: z.string().nullable() }) as unknown as z.ZodType<FieldReading<F>>;
  return z.preprocess((raw) => {
    const { value, quote } = isRecord(raw) && ("value" in raw || "quote" in raw) ? raw : { value: raw, quote: null };
    const normalized = typeof value === "string" && (field === "business" || field === "line") ? value.trim().toLowerCase() : value;
    const text = typeof quote === "string" ? normalizeSpace(quote) : "";
    return { value: normalized === undefined ? null : normalized, quote: text && text.length <= MAX_QUOTE ? text : null };
  }, shape).catch({ value: null, quote: null } as FieldReading<F>);
}

/** One {value, quote} per field; a field that fails validation becomes {null, null} rather than an error. */
export const extractionSchema = z.object({
  yearBuilt: fieldReading("yearBuilt"), losses: fieldReading("losses"), business: fieldReading("business"), line: fieldReading("line"), premium: fieldReading("premium"),
  constructionPercent: fieldReading("constructionPercent"), lossValue: fieldReading("lossValue"), lossHistoryComplete: fieldReading("lossHistoryComplete"),
  effective: fieldReading("effective"), expiration: fieldReading("expiration"),
});

const jsonValue: Record<ExtractionField, Record<string, unknown>> = {
  yearBuilt: { type: ["integer", "null"] }, losses: { type: ["integer", "null"] },
  business: { anyOf: [{ type: "string", enum: ["new", "renewal"] }, { type: "null" }] }, line: { type: ["string", "null"] },
  premium: { type: ["number", "null"] }, constructionPercent: { type: ["number", "null"] }, lossValue: { type: ["number", "null"] },
  lossHistoryComplete: { type: ["boolean", "null"] }, effective: { type: ["string", "null"] }, expiration: { type: ["string", "null"] },
};

/** Strict JSON schema for OpenAI structured output: every field present, each a {value, quote} pair. */
export const openaiSchema = {
  type: "object",
  properties: Object.fromEntries(EXTRACTION_FIELDS.map((field) => [field, {
    type: "object",
    properties: { value: jsonValue[field], quote: { type: ["string", "null"] } },
    required: ["value", "quote"],
    additionalProperties: false,
  }])),
  required: [...EXTRACTION_FIELDS],
  additionalProperties: false,
};

export function emptyReading(): Reading {
  return Object.fromEntries(EXTRACTION_FIELDS.map((field) => [field, { value: null, quote: null }])) as Reading;
}

/** True when the quote appears in the text verbatim; only whitespace differences are forgiven. */
export function quoteInText(quote: string, text: string): boolean {
  const needle = normalizeSpace(quote);
  return needle.length > 0 && normalizeSpace(text).includes(needle);
}

/**
 * Validates a model's JSON against the schema. Returns null when the response
 * is not an object at all; otherwise every field is kept or dropped on its
 * own, a value never keeps a quote the text does not contain, and a quote
 * never survives without a value.
 */
export function parseModelOutput(raw: unknown, text: string): Reading | null {
  if (!isRecord(raw)) return null;
  const reading = extractionSchema.parse(raw) as Reading;
  for (const field of EXTRACTION_FIELDS) {
    const entry = reading[field];
    entry.quote = entry.value !== null && entry.quote !== null && quoteInText(entry.quote, text) ? entry.quote : null;
  }
  return reading;
}

export function readingValues(reading: Reading): ExtractedFields {
  return Object.fromEntries(EXTRACTION_FIELDS.map((field) => [field, reading[field].value])) as ExtractedFields;
}

export function readingQuotes(reading: Reading): Record<ExtractionField, string | null> {
  return Object.fromEntries(EXTRACTION_FIELDS.map((field) => [field, reading[field].quote])) as Record<ExtractionField, string | null>;
}

const countWords = ["zero|none|nil|no|free", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const sentences = (text: string) => text.split(/(?<=[.!?;])\s+|\r?\n/).map((sentence) => sentence.trim().replace(/;$/, "")).filter(Boolean);

/** The last sentence that both names the concept and carries the value; null rather than a guess. */
function sentenceFor(text: string, concept: RegExp, value: RegExp): string | null {
  const matches = sentences(text).filter((sentence) => concept.test(sentence) && value.test(sentence));
  return matches.length ? matches[matches.length - 1] : null;
}

/**
 * The deterministic reading: `parseBrokerNotes` for the year and claim count,
 * `brokerAppetite` for the explicit "Field: value" lines, each with the line
 * or sentence it was taken from. It is the floor when no model is configured.
 */
export function parserReading(text: string): Reading {
  const reading = emptyReading();
  const notes = parseBrokerNotes(text);
  reading.yearBuilt = { value: notes.yearBuilt, quote: notes.yearBuilt === null ? null : sentenceFor(text, /\b(?:built|constructed|erected|construction)\b/i, new RegExp(`\\b${notes.yearBuilt}\\b`)) };
  const countPattern = notes.losses === null ? null : notes.losses <= 10 ? `\\b(?:${notes.losses}|${countWords[notes.losses]})\\b` : `\\b${notes.losses}\\b`;
  reading.losses = { value: notes.losses, quote: countPattern === null ? null : sentenceFor(text, /\b(?:loss|losses|claim|claims)\b/i, new RegExp(countPattern, "i")) };
  const appetite = brokerAppetite(text);
  const lineFor: Partial<Record<AppetiteField, string>> = {};
  for (const line of text.split(/\r?\n/)) for (const key of Object.keys(brokerAppetite(line)) as AppetiteField[]) lineFor[key] = line.trim();
  for (const field of APPETITE_FIELDS) {
    const value = appetite[field] ?? null;
    (reading[field] as FieldReading<typeof field>) = { value, quote: value === null ? null : lineFor[field] ?? null } as FieldReading<typeof field>;
  }
  return reading;
}

export type SourceReading = { source: string; kind: Exclude<SourceKind, "intake">; reading: Reading };

/** Resolves every field across the readers in the order given, which callers arrange by trust (models before the parser). */
export function resolveReadings(readings: SourceReading[]): ResolvedFields {
  const resolved: Partial<Record<ExtractionField, Resolved<FieldValue>>> = {};
  for (const field of EXTRACTION_FIELDS) {
    resolved[field] = resolveField<FieldValue>(FIELD_LABELS[field], readings.map<FieldCandidate<FieldValue>>((item) => ({ source: item.source, kind: item.kind, value: item.reading[field].value, quote: item.reading[field].quote })));
  }
  return resolved as ResolvedFields;
}

export function conflictsOf(fields: ResolvedFields): string[] {
  return EXTRACTION_FIELDS.map((field) => fields[field].conflict).filter((conflict): conflict is string => conflict !== null);
}
