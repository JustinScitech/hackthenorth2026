import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { parseBrokerNotes, type Extracted } from "./analysis";

const extractionSchema = z.object({
  yearBuilt: z.number().int().min(1800).max(new Date().getFullYear()).nullable(),
  losses: z.number().int().min(0).max(1000).nullable(),
});

type Candidate = { source: string; value: Extracted };

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

async function openAIExtraction(text: string): Promise<Extracted | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 0 });
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Extract only facts explicitly stated in the broker text. Return JSON with yearBuilt and losses as integers or null. Losses means the count of losses or claims in the past three years. Later broker updates supersede earlier details. Never infer a missing value." },
        { role: "user", content: text.slice(0, 20_000) },
      ],
    });
    const content = response.choices[0]?.message.content;
    if (!content) return null;
    return extractionSchema.parse(JSON.parse(content));
  } catch (error) {
    console.warn("OpenAI extraction unavailable", error instanceof Error ? error.name : "UnknownError");
    return null;
  }
}

async function geminiExtraction(text: string): Promise<Extracted | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await gemini.models.generateContent({
      model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
      contents: `Extract only explicitly stated insurance submission facts. Return JSON with yearBuilt and losses as integers or null. Losses is the count in the past three years. Later broker updates supersede earlier details. Do not infer missing values.\n\n${text.slice(0, 20_000)}`,
      config: { responseMimeType: "application/json", httpOptions: { timeout: 45_000 } },
    });
    return response.text ? extractionSchema.parse(JSON.parse(response.text)) : null;
  } catch (error) {
    console.warn("Gemini extraction unavailable", error instanceof Error ? error.name : "UnknownError");
    return null;
  }
}

export async function extractNotes(text: string): Promise<{ extracted: Extracted; conflicts: string[]; sources: string[] }> {
  const parser = parseBrokerNotes(text);
  const [openai, gemini] = await Promise.all([openAIExtraction(text), geminiExtraction(text)]);
  const candidates: Candidate[] = [{ source: "Parser", value: parser }];
  if (openai) candidates.push({ source: "OpenAI", value: openai });
  if (gemini) candidates.push({ source: "Gemini", value: gemini });
  const primary = openai ?? gemini ?? parser;
  return {
    extracted: { yearBuilt: primary.yearBuilt ?? parser.yearBuilt, losses: primary.losses ?? parser.losses },
    conflicts: extractionConflicts(candidates),
    sources: candidates.map((candidate) => candidate.source),
  };
}
