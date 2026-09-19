import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { parseBrokerNotes, type Extracted } from "./analysis";

const extractionSchema = z.object({
  yearBuilt: z.number().int().min(1800).max(new Date().getFullYear()).nullable(),
  losses: z.number().int().min(0).max(1000).nullable(),
});

type Candidate = { source: string; value: Extracted };
export type ModelAttempt = {
  source: "OpenAI" | "Gemini";
  model: string;
  status: "not_configured" | "started" | "completed" | "failed";
  durationMs: number;
  value?: Extracted;
  errorCode?: number;
  attemptCount?: number;
};

export const GEMINI_WATERFALL = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"] as const;
type ModelObserver = (event: "started" | "completed" | "failed", attempt: ModelAttempt) => Promise<void>;

function errorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

export function shouldFallThroughGeminiError(error: unknown): boolean {
  const code = errorCode(error);
  return code === undefined || code === 404 || code === 408 || code >= 500;
}

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

async function openAIExtraction(text: string): Promise<ModelAttempt> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  if (!process.env.OPENAI_API_KEY) return { source: "OpenAI", model, status: "not_configured", durationMs: 0 };
  const started = performance.now();
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 0 });
    const response = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Extract only facts explicitly stated in the broker text. Return JSON with yearBuilt and losses as integers or null. Losses means the count of losses or claims in the past three years. Later broker updates supersede earlier details. Never infer a missing value." },
        { role: "user", content: text.slice(0, 20_000) },
      ],
    });
    const content = response.choices[0]?.message.content;
    if (!content) throw new Error("Empty model response");
    return { source: "OpenAI", model: response.model || model, status: "completed", durationMs: Math.round(performance.now() - started), value: extractionSchema.parse(JSON.parse(content)) };
  } catch (error) {
    console.warn("OpenAI extraction unavailable", error instanceof Error ? error.name : "UnknownError");
    return { source: "OpenAI", model, status: "failed", durationMs: Math.round(performance.now() - started), errorCode: errorCode(error) };
  }
}

export async function runGeminiWaterfall(
  generate: (model: string) => Promise<{ text?: string; modelVersion?: string }>,
  onEvent?: ModelObserver,
  models: readonly string[] = GEMINI_WATERFALL,
): Promise<ModelAttempt[]> {
  const attempts: ModelAttempt[] = [];
  for (const model of models) {
    const started = performance.now();
    await onEvent?.("started", { source: "Gemini", model, status: "started", durationMs: 0 });
    let completed: ModelAttempt | undefined;
    try {
      const response = await generate(model);
      if (!response.text) throw new Error("Empty model response");
      completed = { source: "Gemini", model: response.modelVersion || model, status: "completed", durationMs: Math.round(performance.now() - started), value: extractionSchema.parse(JSON.parse(response.text)), attemptCount: 1 };
    } catch (error) {
      const attempt: ModelAttempt = { source: "Gemini", model, status: "failed", durationMs: Math.round(performance.now() - started), errorCode: errorCode(error), attemptCount: 1 };
      attempts.push(attempt);
      console.warn("Gemini extraction unavailable", model, error instanceof Error ? error.name : "UnknownError");
      await onEvent?.("failed", attempt);
      if (!shouldFallThroughGeminiError(error)) break;
    }
    if (completed) {
      attempts.push(completed);
      await onEvent?.("completed", completed);
      break;
    }
  }
  return attempts;
}

async function geminiExtraction(text: string, onEvent?: ModelObserver): Promise<ModelAttempt[]> {
  const models = [...new Set([process.env.GEMINI_MODEL || GEMINI_WATERFALL[0], ...GEMINI_WATERFALL])];
  if (!process.env.GEMINI_API_KEY) return [{ source: "Gemini", model: models[0], status: "not_configured", durationMs: 0 }];
  const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return runGeminiWaterfall((model) => gemini.models.generateContent({
    model,
    contents: `Extract only explicitly stated insurance submission facts. Return JSON with yearBuilt and losses as integers or null. Losses is the count in the past three years. Later broker updates supersede earlier details. Do not infer missing values.\n\n${text.slice(0, 20_000)}`,
    config: { responseMimeType: "application/json", httpOptions: { timeout: 25_000 } },
  }), onEvent, models);
}

export async function extractNotes(text: string, onGeminiEvent?: ModelObserver): Promise<{ extracted: Extracted; fieldSources: { yearBuilt: string; losses: string }; conflicts: string[]; sources: string[]; attempts: ModelAttempt[] }> {
  const parser = parseBrokerNotes(text);
  const [openai, geminiAttempts] = await Promise.all([openAIExtraction(text), geminiExtraction(text, onGeminiEvent)]);
  const gemini = geminiAttempts.find((attempt) => attempt.status === "completed");
  const candidates: Candidate[] = [{ source: "Parser", value: parser }];
  if (openai.value) candidates.push({ source: "OpenAI", value: openai.value });
  if (gemini?.value) candidates.push({ source: `Gemini ${gemini.model}`, value: gemini.value });
  function pickField(field: keyof Extracted): { value: number | null; source: string } {
    for (const candidate of [gemini, openai]) {
      if (!candidate) continue;
      const value = candidate.value?.[field];
      if (value !== undefined && value !== null) return { value, source: candidate.source === "Gemini" ? `Gemini ${candidate.model}` : candidate.source };
    }
    return { value: parser[field], source: parser[field] === null ? "Not provided" : "Parser" };
  }
  const yearBuilt = pickField("yearBuilt");
  const losses = pickField("losses");
  return {
    extracted: { yearBuilt: yearBuilt.value, losses: losses.value },
    fieldSources: { yearBuilt: yearBuilt.source, losses: losses.source },
    conflicts: extractionConflicts(candidates),
    sources: candidates.map((candidate) => candidate.source),
    attempts: [openai, ...geminiAttempts],
  };
}
