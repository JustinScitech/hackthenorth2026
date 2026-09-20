import { z } from "zod";
import { parseBrokerNotes, type Extracted } from "./analysis";
import { errorCode, geminiJson, geminiModels, GEMINI_WATERFALL, openaiJson, openaiModel, type TokenUsage } from "./providers";
import { resolveField, type FieldCandidate } from "./resolution";

export { GEMINI_WATERFALL };

const extractionSchema = z.object({
  yearBuilt: z.number().int().min(1800).max(new Date().getFullYear()).nullable(),
  losses: z.number().int().min(0).max(1000).nullable(),
});
const openaiSchema = {
  type: "object",
  properties: { yearBuilt: { type: ["integer", "null"] }, losses: { type: ["integer", "null"] } },
  required: ["yearBuilt", "losses"],
  additionalProperties: false,
};

const EXTRACTION_PROMPT = 'You extract facts for an underwriting review. Return only JSON matching {"yearBuilt": integer|null, "losses": integer|null}. Extract only facts explicitly stated in the broker text. "losses" is a count of losses or claims in the past three years, not a dollar amount. When several buildings are listed, yearBuilt is the oldest. Later broker updates supersede earlier details. Do not infer missing values, convert currency, or treat a dollar loss total as a claim count.';

type Candidate = { source: string; value: Extracted };
export type ModelSource = "Gemini" | "OpenAI";
export type ModelAttempt = {
  source: ModelSource;
  model: string;
  status: "not_configured" | "started" | "completed" | "failed";
  durationMs: number;
  value?: Extracted;
  errorCode?: number;
  attemptCount?: number;
  usage?: TokenUsage;
};

type ModelObserver = (event: "started" | "completed" | "failed", attempt: ModelAttempt) => Promise<void>;

export function shouldFallThroughGeminiError(error: unknown): boolean {
  const code = errorCode(error);
  return code === undefined || code === 404 || code === 408 || code >= 500;
}

/** Kept for the activity trace and tests; resolveField now decides which value is used. */
export function extractionConflicts(candidates: Candidate[]): string[] {
  const conflicts: string[] = [];
  for (const field of ["yearBuilt", "losses"] as const) {
    const stated = candidates.filter((candidate) => candidate.value[field] !== null);
    if (new Set(stated.map((candidate) => candidate.value[field])).size > 1) {
      conflicts.push(`${field === "yearBuilt" ? "Year built" : "Recent loss count"} differs: ${stated.map((candidate) => `${candidate.source} ${candidate.value[field]}`).join(", ")}.`);
    }
  }
  return conflicts;
}

async function runAttempt(source: ModelSource, model: string, generate: () => Promise<{ text?: string; modelVersion?: string; attemptCount?: number; usage?: TokenUsage }>, onEvent?: ModelObserver): Promise<ModelAttempt & { error?: unknown }> {
  const started = performance.now();
  await onEvent?.("started", { source, model, status: "started", durationMs: 0 });
  try {
    const response = await generate();
    if (!response.text) throw new Error("Empty model response");
    const completed: ModelAttempt = { source, model: response.modelVersion || model, status: "completed", durationMs: Math.round(performance.now() - started), value: extractionSchema.parse(JSON.parse(response.text)), attemptCount: response.attemptCount ?? 1, usage: response.usage };
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
  generate: (model: string) => Promise<{ text?: string; modelVersion?: string; attemptCount?: number; usage?: TokenUsage }>,
  onEvent?: ModelObserver,
  models: readonly string[] = GEMINI_WATERFALL,
): Promise<ModelAttempt[]> {
  const attempts: ModelAttempt[] = [];
  for (const model of models) {
    const { error, ...attempt } = await runAttempt("Gemini", model, () => generate(model), onEvent);
    attempts.push(attempt);
    if (attempt.status === "completed" || !shouldFallThroughGeminiError(error)) break;
  }
  return attempts;
}

async function geminiExtraction(text: string, onEvent?: ModelObserver): Promise<ModelAttempt[]> {
  const models = geminiModels();
  if (!process.env.GEMINI_API_KEY) return [{ source: "Gemini", model: models[0], status: "not_configured", durationMs: 0 }];
  return runGeminiWaterfall((model) => geminiJson(model, EXTRACTION_PROMPT, text), onEvent, models);
}

async function openaiExtraction(text: string, onEvent?: ModelObserver): Promise<ModelAttempt[]> {
  const model = openaiModel();
  if (!process.env.OPENAI_API_KEY) return [{ source: "OpenAI", model, status: "not_configured", durationMs: 0 }];
  const { error: _error, ...attempt } = await runAttempt("OpenAI", model, () => openaiJson(model, EXTRACTION_PROMPT, text, openaiSchema), onEvent);
  return [attempt];
}

export type Extraction = {
  extracted: Extracted;
  fieldSources: { yearBuilt: string; losses: string };
  confidence: { yearBuilt: number; losses: number };
  conflicts: string[];
  sources: string[];
  attempts: ModelAttempt[];
};

/**
 * Runs every configured model alongside the deterministic parser and resolves
 * each field by agreement. Models are ordered Gemini, OpenAI, then parser so a
 * tie between a model and the parser keeps the model at reduced confidence.
 */
export async function extractNotes(text: string, onModelEvent?: ModelObserver): Promise<Extraction> {
  const parser = parseBrokerNotes(text);
  const [geminiAttempts, openaiAttempts] = await Promise.all([geminiExtraction(text, onModelEvent), openaiExtraction(text, onModelEvent)]);
  const attempts = [...geminiAttempts, ...openaiAttempts];
  const completed = attempts.filter((attempt) => attempt.status === "completed" && attempt.value);
  const candidates: Candidate[] = [...completed.map((attempt) => ({ source: `${attempt.source} ${attempt.model}`, value: attempt.value! })), { source: "Parser", value: parser }];
  const resolve = (field: keyof Extracted, label: string) => resolveField(label, candidates.map<FieldCandidate>((candidate) => ({ source: candidate.source, kind: candidate.source === "Parser" ? "parser" : "model", value: candidate.value[field] })));
  const yearBuilt = resolve("yearBuilt", "Year built");
  const losses = resolve("losses", "Recent loss count");
  return {
    extracted: { yearBuilt: yearBuilt.value, losses: losses.value },
    fieldSources: { yearBuilt: yearBuilt.source, losses: losses.source },
    confidence: { yearBuilt: yearBuilt.confidence, losses: losses.confidence },
    conflicts: [yearBuilt.conflict, losses.conflict].filter((conflict): conflict is string => conflict !== null),
    sources: candidates.map((candidate) => candidate.source),
    attempts,
  };
}
