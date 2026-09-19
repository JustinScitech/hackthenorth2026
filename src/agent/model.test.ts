import assert from "node:assert/strict";
import test from "node:test";
import { extractNotes, extractionConflicts, shouldRetryGeminiError } from "./model";

test("flags differing values without treating missing values as a contradiction", () => {
  assert.deepEqual(extractionConflicts([
    { source: "Parser", value: { yearBuilt: 1998, losses: null } },
    { source: "Gemini", value: { yearBuilt: 2001, losses: 0 } },
  ]), ["Year built differs: Parser 1998, Gemini 2001."]);
});

test("parser fallback is labeled when no model is configured", async () => {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const result = await extractNotes("The building was constructed in 2005 and had no losses in the past three years.");
    assert.deepEqual(result.extracted, { yearBuilt: 2005, losses: 0 });
    assert.deepEqual(result.fieldSources, { yearBuilt: "Parser", losses: "Parser" });
    assert.deepEqual(result.attempts.map((attempt) => attempt.status), ["not_configured", "not_configured"]);
  } finally {
    if (openaiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = openaiKey;
    if (geminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = geminiKey;
  }
});

test("Gemini retries transient failures without hammering rate limits", () => {
  assert.equal(shouldRetryGeminiError({ status: 503 }), true);
  assert.equal(shouldRetryGeminiError({ status: 500 }), true);
  assert.equal(shouldRetryGeminiError({ status: 429 }), false);
  assert.equal(shouldRetryGeminiError({ status: 400 }), false);
});
