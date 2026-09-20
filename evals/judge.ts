import { runGeminiWaterfall } from "../src/agent/model";
import { geminiJson, geminiModels } from "../src/agent/providers";

/**
 * Optional LLM judge for the eval suites. It runs only when EVAL_JUDGE=gemini
 * is set and a Gemini key exists; `npm run eval` loads .env, so the key alone
 * must never switch a suite onto a live model. Suites always decide pass or
 * fail with their deterministic floor and record the judge's view as metrics,
 * so a flaky model can never trip the ratchet.
 */
export function judgeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.EVAL_JUDGE === "gemini" && Boolean(env.GEMINI_API_KEY);
}

export type JudgeOutcome<T> = { value: T; model: string } | { error: string };

export async function judgeJson<T>(prompt: string, text: string, parse: (text: string) => T): Promise<JudgeOutcome<T>> {
  const attempts = await runGeminiWaterfall<T>((model) => geminiJson(model, prompt, text, { retries: 1, timeoutMs: 30_000 }), undefined, geminiModels(), text, parse);
  const completed = attempts.find((attempt) => attempt.status === "completed" && attempt.value !== undefined);
  if (!completed?.value) return { error: `judge unavailable after ${attempts.length} attempt${attempts.length === 1 ? "" : "s"}${attempts.at(-1)?.errorCode ? ` (HTTP ${attempts.at(-1)!.errorCode})` : ""}` };
  return { value: completed.value, model: completed.model };
}
