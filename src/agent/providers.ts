import { GoogleGenAI } from "@google/genai";
import { traceModelCall } from "./monitoring";

/**
 * Thin JSON-returning wrappers over the two model providers. Both take a
 * prompt and the text to read, return the raw JSON string, and retry only
 * transient statuses. Callers validate the JSON against their own schema.
 */
export type TokenUsage = { input: number; output: number };
export type JsonResponse = { text?: string; modelVersion?: string; attemptCount?: number; usage?: TokenUsage };

export function errorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

const transient = (status: number | undefined) => status === 429 || status === 500 || status === 502 || status === 503 || status === 504;

export type CallOptions = { retries?: number; timeoutMs?: number; signal?: AbortSignal };

async function withRetries(call: () => Promise<JsonResponse>, retries = 3, signal?: AbortSignal): Promise<JsonResponse> {
  for (let attempt = 0; attempt < retries; attempt++) {
    signal?.throwIfAborted();
    try {
      const response = await call();
      return { ...response, attemptCount: attempt + 1 };
    } catch (error) {
      signal?.throwIfAborted();
      if (!transient(errorCode(error)) || attempt === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  return { text: undefined };
}

export const GEMINI_WATERFALL = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"] as const;

export function geminiModels(): string[] {
  return [...new Set([process.env.GEMINI_MODEL || "gemini-3.5-flash-lite", ...GEMINI_WATERFALL])];
}

export function geminiJson(model: string, prompt: string, text: string, options: CallOptions = {}): Promise<JsonResponse> {
  const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return withRetries(() => traceModelCall("gemini", model, async () => {
    const response = await gemini.models.generateContent({
      model, contents: `${prompt}\n\n${text.slice(0, 20_000)}`,
      config: { responseMimeType: "application/json", abortSignal: options.signal, httpOptions: { timeout: options.timeoutMs ?? 45_000 } },
    });
    const meta = response.usageMetadata;
    return { text: response.text, modelVersion: response.modelVersion, usage: meta ? { input: meta.promptTokenCount ?? 0, output: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0) } : undefined };
  }), options.retries, options.signal);
}

export type ChatContent = { role: "user" | "model"; text: string };

/** Plain-text generation with a system instruction and a short conversation, for the case chat. Same client, retries, and tracing as the JSON call. */
export function geminiText(model: string, system: string, contents: ChatContent[], options: CallOptions = {}): Promise<JsonResponse> {
  const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return withRetries(() => traceModelCall("gemini", model, async () => {
    const response = await gemini.models.generateContent({
      model,
      contents: contents.map((turn) => ({ role: turn.role, parts: [{ text: turn.text.slice(0, 20_000) }] })),
      config: { systemInstruction: system, httpOptions: { timeout: options.timeoutMs ?? 45_000 } },
    });
    return { text: response.text, modelVersion: response.modelVersion };
  }), options.retries, options.signal);
}

/** Streams visible reply text from the same model and prompt path used for a complete answer. */
export function geminiTextStream(model: string, system: string, contents: ChatContent[], onChunk: (chunk: string) => void, options: CallOptions = {}): Promise<JsonResponse> {
  const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return traceModelCall("gemini", model, async () => {
    const stream = await gemini.models.generateContentStream({
      model,
      contents: contents.map((turn) => ({ role: turn.role, parts: [{ text: turn.text.slice(0, 20_000) }] })),
      config: { systemInstruction: system, httpOptions: { timeout: options.timeoutMs ?? 45_000 } },
    });
    let text = "";
    let modelVersion: string | undefined;
    for await (const response of stream) {
      const chunk = response.text ?? "";
      if (chunk) { text += chunk; onChunk(chunk); }
      modelVersion = response.modelVersion ?? modelVersion;
    }
    return { text, modelVersion };
  });
}

export const DEFAULT_OPENAI_MODEL = "gpt-5-mini";

export function openaiModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
}

/** Chat Completions with a strict JSON schema so the model cannot add or omit fields. */
export function openaiJson(model: string, prompt: string, text: string, schema: Record<string, unknown>, options: CallOptions = {}, request: typeof fetch = fetch): Promise<JsonResponse> {
  return withRetries(() => traceModelCall("openai", model, async () => {
    const response = await request("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: prompt }, { role: "user", content: text.slice(0, 20_000) }],
        response_format: { type: "json_schema", json_schema: { name: "extraction", strict: true, schema } },
      }),
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 45_000)]) : AbortSignal.timeout(options.timeoutMs ?? 45_000),
    });
    if (!response.ok) throw Object.assign(new Error(`OpenAI HTTP ${response.status}`), { status: response.status });
    const body = await response.json() as { model?: string; choices?: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return { text: body.choices?.[0]?.message?.content ?? undefined, modelVersion: body.model, usage: body.usage ? { input: body.usage.prompt_tokens ?? 0, output: body.usage.completion_tokens ?? 0 } : undefined };
  }), options.retries, options.signal);
}
