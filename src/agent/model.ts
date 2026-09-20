import { conflictsOf, EXTRACTION_FIELDS, EXTRACTION_PROMPT, extractionSchema, FIELD_LABELS, openaiSchema, parseModelOutput, parserReading, readingValues, resolveReadings, type ExtractedFields, type ExtractionField, type Reading, type ResolvedFields, type SourceReading } from "./extraction-schema";
import { errorCode, geminiJson, geminiModels, GEMINI_WATERFALL, openaiJson, openaiModel } from "./providers";

export { EXTRACTION_PROMPT, extractionSchema, GEMINI_WATERFALL, openaiSchema };

type Candidate = { source: string; value: ExtractedFields };
export type ModelSource = "Gemini" | "OpenAI";
export type ModelAttempt = {
  source: ModelSource;
  model: string;
  status: "not_configured" | "started" | "completed" | "failed";
  durationMs: number;
  /** The values the model read, for traces and evals; `reading` carries the quotes behind them. */
  value?: ExtractedFields;
  reading?: Reading;
  errorCode?: number;
  attemptCount?: number;
};

type ModelObserver = (event: "started" | "completed" | "failed", attempt: ModelAttempt) => Promise<void>;

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

async function runAttempt(source: ModelSource, model: string, text: string, generate: () => Promise<{ text?: string; modelVersion?: string; attemptCount?: number }>, onEvent?: ModelObserver): Promise<ModelAttempt & { error?: unknown }> {
  const started = performance.now();
  await onEvent?.("started", { source, model, status: "started", durationMs: 0 });
  try {
    const response = await generate();
    const reading = readResponse(response.text, text);
    const completed: ModelAttempt = { source, model: response.modelVersion || model, status: "completed", durationMs: Math.round(performance.now() - started), value: readingValues(reading), reading, attemptCount: response.attemptCount ?? 1 };
    await onEvent?.("completed", completed);
    return completed;
  } catch (error) {
    const failed: ModelAttempt = { source, model, status: "failed", durationMs: Math.round(performance.now() - started), errorCode: errorCode(error), attemptCount: 1 };
    console.warn(`${source} extraction unavailable`, model, error instanceof Error ? error.name : "UnknownError");
    await onEvent?.("failed", failed);
    return { ...failed, error };
  }
}

export async function runGeminiWaterfall(
  generate: (model: string) => Promise<{ text?: string; modelVersion?: string; attemptCount?: number }>,
  onEvent?: ModelObserver,
  models: readonly string[] = GEMINI_WATERFALL,
  text = "",
): Promise<ModelAttempt[]> {
  const attempts: ModelAttempt[] = [];
  for (const model of models) {
    const { error, ...attempt } = await runAttempt("Gemini", model, text, () => generate(model), onEvent);
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
  const { error: _error, ...attempt } = await runAttempt("OpenAI", model, text, () => openaiJson(model, EXTRACTION_PROMPT, text, openaiSchema), onEvent);
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
