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

async function geminiExtraction(text: string): Promise<Extracted | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await gemini.models.generateContent({
        model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
        contents: `You extract facts for an underwriting review. Return only JSON matching {"yearBuilt": integer|null, "losses": integer|null}. Extract only facts explicitly stated in the broker text. "losses" is a count of losses or claims in the past three years, not a dollar amount. Later broker updates supersede earlier details. Do not infer missing values, convert currency, or treat a dollar loss total as a claim count.\n\n${text.slice(0, 20_000)}`,
        config: { responseMimeType: "application/json", httpOptions: { timeout: 45_000 } },
      });
      return response.text ? extractionSchema.parse(JSON.parse(response.text)) : null;
    } catch (error) {
      const status = (error as { status?: unknown }).status;
      const transient = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
      if (!transient || attempt === 2) {
        console.warn("Gemini extraction unavailable", error instanceof Error ? error.name : "UnknownError", typeof status === "number" ? `HTTP ${status}` : "");
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  return null;
}

export async function extractNotes(text: string): Promise<{ extracted: Extracted; conflicts: string[]; sources: string[] }> {
  const parser = parseBrokerNotes(text);
  const gemini = await geminiExtraction(text);
  const candidates: Candidate[] = [{ source: "Parser", value: parser }];
  if (gemini) candidates.push({ source: "Gemini", value: gemini });
  const primary = gemini ?? parser;
  return {
    extracted: { yearBuilt: primary.yearBuilt ?? parser.yearBuilt, losses: primary.losses ?? parser.losses },
    conflicts: extractionConflicts(candidates),
    sources: candidates.map((candidate) => candidate.source),
  };
}
