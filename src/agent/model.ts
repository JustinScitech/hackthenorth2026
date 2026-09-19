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
  status: "not_configured" | "completed" | "failed";
  durationMs: number;
  value?: Extracted;
  errorCode?: number;
  attemptCount?: number;
};

function errorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

export function shouldRetryGeminiError(error: unknown): boolean {
  return [408, 500, 502, 503, 504].includes(errorCode(error) ?? 0);
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

async function geminiExtraction(text: string): Promise<ModelAttempt> {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  if (!process.env.GEMINI_API_KEY) return { source: "Gemini", model, status: "not_configured", durationMs: 0 };
  const started = performance.now();
  const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let lastError: unknown;
  let attempts = 0;
  for (let attemptCount = 1; attemptCount <= 3; attemptCount++) {
    attempts = attemptCount;
    try {
      const response = await gemini.models.generateContent({
        model,
        contents: `Extract only explicitly stated insurance submission facts. Return JSON with yearBuilt and losses as integers or null. Losses is the count in the past three years. Later broker updates supersede earlier details. Do not infer missing values.\n\n${text.slice(0, 20_000)}`,
        config: { responseMimeType: "application/json", httpOptions: { timeout: 25_000 } },
      });
      if (!response.text) throw new Error("Empty model response");
      return { source: "Gemini", model: response.modelVersion || model, status: "completed", durationMs: Math.round(performance.now() - started), value: extractionSchema.parse(JSON.parse(response.text)), attemptCount };
    } catch (error) {
      lastError = error;
      if (attemptCount === 3 || !shouldRetryGeminiError(error)) break;
      await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** (attemptCount - 1) + Math.random() * 250));
    }
  }
  console.warn("Gemini extraction unavailable", lastError instanceof Error ? lastError.name : "UnknownError");
  return { source: "Gemini", model, status: "failed", durationMs: Math.round(performance.now() - started), errorCode: errorCode(lastError), attemptCount: attempts };
}

export async function extractNotes(text: string): Promise<{ extracted: Extracted; fieldSources: { yearBuilt: string; losses: string }; conflicts: string[]; sources: string[]; attempts: ModelAttempt[] }> {
  const parser = parseBrokerNotes(text);
  const [openai, gemini] = await Promise.all([openAIExtraction(text), geminiExtraction(text)]);
  const candidates: Candidate[] = [{ source: "Parser", value: parser }];
  if (openai.value) candidates.push({ source: "OpenAI", value: openai.value });
  if (gemini.value) candidates.push({ source: "Gemini", value: gemini.value });
  function pickField(field: keyof Extracted): { value: number | null; source: string } {
    for (const candidate of [openai, gemini]) {
      const value = candidate.value?.[field];
      if (value !== undefined && value !== null) return { value, source: candidate.source };
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
    attempts: [openai, gemini],
  };
}
