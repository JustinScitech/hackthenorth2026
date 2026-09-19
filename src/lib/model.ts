import OpenAI from "openai";
import { z } from "zod";
import { parseBrokerNotes, type Extracted } from "./analysis";

const extractionSchema = z.object({
  yearBuilt: z.number().int().min(1800).max(new Date().getFullYear()).nullable(),
  losses: z.number().int().min(0).max(1000).nullable(),
});

export async function extractNotes(text: string): Promise<Extracted> {
  const fallback = parseBrokerNotes(text);
  if (!process.env.OPENAI_API_KEY) return fallback;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 0 });
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Extract only facts explicitly stated in the broker text. Return JSON with yearBuilt and losses as integers or null. Losses means the count of losses or claims in the past three years. Never infer a missing value." },
        { role: "user", content: text.slice(0, 20_000) },
      ],
    });
    const content = response.choices[0]?.message.content;
    if (!content) return fallback;
    return extractionSchema.parse(JSON.parse(content));
  } catch (error) {
    console.warn("Model extraction failed; using deterministic parser", error);
    return fallback;
  }
}
