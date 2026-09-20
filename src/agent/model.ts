import { conflictsOf, EXTRACTION_FIELDS, EXTRACTION_PROMPT, extractionSchema, FIELD_LABELS, openaiSchema, parseModelOutput, parserReading, readingValues, resolveReadings, type ExtractedFields, type ExtractionField, type Reading, type ResolvedFields, type SourceReading } from "./extraction-schema";
import { errorCode, geminiJson, geminiModels, GEMINI_WATERFALL, openaiJson, openaiModel, type TokenUsage } from "./providers";

export { EXTRACTION_PROMPT, extractionSchema, GEMINI_WATERFALL, openaiSchema };

type Candidate = { source: string; value: ExtractedFields };
export type ModelSource = "Gemini" | "OpenAI";
/** One model call. `value` is the parsed JSON: the extraction fields by default, another shape when the caller supplies its own parser. */
export type ModelAttempt<T = ExtractedFields> = {
  source: ModelSource;
  model: string;
  status: "not_configured" | "started" | "completed" | "failed";
  durationMs: number;
  /** The values the model read, for traces and evals; `reading` carries the quotes behind them (extraction only). */
  value?: T;
  reading?: Reading;
  errorCode?: number;
  attemptCount?: number;
  usage?: TokenUsage;
};

export type ModelObserver<T = ExtractedFields> = (event: "started" | "completed" | "failed", attempt: ModelAttempt<T>) => Promise<void>;
export type JsonParser<T> = (text: string) => T;
type AttemptParser<T> = (text: string | undefined) => { value: T; reading?: Reading };

export function shouldFallThroughGeminiError(error: unknown): boolean {
  const code = errorCode(error);
  return code === undefined || code === 404 || code === 408 || code >= 500;
}

/** Kept for the activity trace and tests; resolveField now decides which value is used. */
export function extractionConflicts(candidates: Candidate[]): string[] {
  const conflicts: string[] = [];
  for (const field of EXTRACTION_FIELDS) {
    const stated = candidates.filter((candidate) => candidate.value[field] !== null);
    if (new Set(stated.map((candidate) => candidate.value[field])).size > 1) {
      conflicts.push(`${FIELD_LABELS[field]} differs: ${stated.map((candidate) => `${candidate.source} ${candidate.value[field]}`).join(", ")}.`);
    }
  }
  return conflicts;
}

/** Malformed JSON or a non-object body fails this attempt only; a bad field inside an object is dropped by the schema. */
function readResponse(text: string | undefined, source: string): Reading {
  if (!text) throw new Error("Empty model response");
  const reading = parseModelOutput(JSON.parse(text), source);
  if (!reading) throw new Error("Malformed model response");
  return reading;
}

/** The default parser: the extraction schema with quotes checked against the source text. */
const extractionParser = (text: string): AttemptParser<ExtractedFields> => (raw) => { const reading = readResponse(raw, text); return { value: readingValues(reading), reading }; };
/** Any other JSON shape: the caller's parser decides, and a malformed answer fails the attempt the same way. */
const jsonParser = <T>(parse: JsonParser<T>): AttemptParser<T> => (raw) => { if (!raw) throw new Error("Empty model response"); return { value: parse(raw) }; };

async function runAttempt<T>(source: ModelSource, model: string, parse: AttemptParser<T>, generate: () => Promise<{ text?: string; modelVersion?: string; attemptCount?: number }>, onEvent?: ModelObserver<T>): Promise<ModelAttempt<T> & { error?: unknown }> {
  const started = performance.now();
  await onEvent?.("started", { source, model, status: "started", durationMs: 0 });
  try {
    const response = await generate();
    const parsed = parse(response.text);
    const completed: ModelAttempt<T> = { source, model: response.modelVersion || model, status: "completed", durationMs: Math.round(performance.now() - started), value: parsed.value, reading: parsed.reading, attemptCount: response.attemptCount ?? 1 };
    await onEvent?.("completed", completed);
    return completed;
  } catch (error) {
    const failed: ModelAttempt<T> = { source, model, status: "failed", durationMs: Math.round(performance.now() - started), errorCode: errorCode(error), attemptCount: 1 };
    console.warn(`${source} model unavailable`, model, error instanceof Error ? error.name : "UnknownError");
    await onEvent?.("failed", failed);
    return { ...failed, error };
  }
}

/** Tries each Gemini model in turn until one returns JSON the parser accepts; a malformed answer falls through like a transient error. `parse` swaps the extraction schema for another shape. */
export async function runGeminiWaterfall<T = ExtractedFields>(
  generate: (model: string) => Promise<{ text?: string; modelVersion?: string; attemptCount?: number; usage?: TokenUsage }>,
  onEvent?: ModelObserver<T>,
  models: readonly string[] = GEMINI_WATERFALL,
  text = "",
  parse?: JsonParser<T>,
): Promise<ModelAttempt<T>[]> {
  const parser = parse ? jsonParser(parse) : extractionParser(text) as unknown as AttemptParser<T>;
  const attempts: ModelAttempt<T>[] = [];
  for (const model of models) {
    const { error, ...attempt } = await runAttempt("Gemini", model, parser, () => generate(model), onEvent);
    attempts.push(attempt);
    if (attempt.status === "completed" || !shouldFallThroughGeminiError(error)) break;
  }
  return attempts;
}

async function geminiExtraction(text: string, onEvent?: ModelObserver): Promise<ModelAttempt[]> {
  const models = geminiModels();
  if (!process.env.GEMINI_API_KEY) return [{ source: "Gemini", model: models[0], status: "not_configured", durationMs: 0 }];
  return runGeminiWaterfall((model) => geminiJson(model, EXTRACTION_PROMPT, text), onEvent, models, text);
}

async function openaiExtraction(text: string, onEvent?: ModelObserver): Promise<ModelAttempt[]> {
  const model = openaiModel();
  if (!process.env.OPENAI_API_KEY) return [{ source: "OpenAI", model, status: "not_configured", durationMs: 0 }];
  const { error: _error, ...attempt } = await runAttempt("OpenAI", model, extractionParser(text), () => openaiJson(model, EXTRACTION_PROMPT, text, openaiSchema), onEvent);
  return [attempt];
}

export type Extraction = {
  extracted: ExtractedFields;
  /** Per-field resolution: value, winning source, confidence, quote, conflict, and every candidate. */
  fields: ResolvedFields;
  fieldSources: Record<ExtractionField, string>;
  confidence: Record<ExtractionField, number>;
  quotes: Record<ExtractionField, string | null>;
  conflicts: string[];
  sources: string[];
  attempts: ModelAttempt[];
};

/**
 * Resolves each field by agreement across the completed model readings and
 * the deterministic parser. Models are ordered Gemini, OpenAI, then parser so
 * a tie between a model and the parser keeps the model at reduced confidence.
 */
export function assembleExtraction(text: string, attempts: ModelAttempt[]): Extraction {
  const completed = attempts.filter((attempt): attempt is ModelAttempt & { reading: Reading } => attempt.status === "completed" && attempt.reading !== undefined);
  const readings: SourceReading[] = [...completed.map<SourceReading>((attempt) => ({ source: `${attempt.source} ${attempt.model}`, kind: "model", reading: attempt.reading })), { source: "Parser", kind: "parser", reading: parserReading(text) }];
  const fields = resolveReadings(readings);
  const record = <T>(pick: (field: ExtractionField) => T) => Object.fromEntries(EXTRACTION_FIELDS.map((field) => [field, pick(field)])) as Record<ExtractionField, T>;
  return {
    extracted: record((field) => fields[field].value) as ExtractedFields,
    fields,
    fieldSources: record((field) => fields[field].source),
    confidence: record((field) => fields[field].confidence),
    quotes: record((field) => fields[field].quote),
    conflicts: conflictsOf(fields),
    sources: readings.map((reading) => reading.source),
    attempts,
  };
}

/** Runs every configured model alongside the parser; a model that fails, times out, or returns bad JSON is simply absent from the vote. */
export async function extractNotes(text: string, onModelEvent?: ModelObserver): Promise<Extraction> {
  const [geminiAttempts, openaiAttempts] = await Promise.all([geminiExtraction(text, onModelEvent), openaiExtraction(text, onModelEvent)]);
  return assembleExtraction(text, [...geminiAttempts, ...openaiAttempts]);
}
