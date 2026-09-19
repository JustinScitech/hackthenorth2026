import assert from "node:assert/strict";
import test from "node:test";
import { extractNotes, extractionConflicts, GEMINI_WATERFALL, runGeminiWaterfall, shouldFallThroughGeminiError } from "./model";

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

test("Gemini waterfall uses the next model after a transient failure", async () => {
  const called: string[] = [];
  const events: string[] = [];
  const attempts = await runGeminiWaterfall(async (model) => {
    called.push(model);
    if (model === GEMINI_WATERFALL[0]) throw { status: 503 };
    return { text: '{"yearBuilt":2005,"losses":0}', modelVersion: model };
  }, async (event, attempt) => { events.push(`${event}:${attempt.model}`); });
  assert.deepEqual(called, GEMINI_WATERFALL.slice(0, 2));
  assert.deepEqual(attempts.map((attempt) => attempt.status), ["failed", "completed"]);
  assert.deepEqual(events, ["started:gemini-3.8-flash", "failed:gemini-3.8-flash", "started:gemini-3.7-flash", "completed:gemini-3.7-flash"]);
});

test("Gemini waterfall stops on project quota errors", async () => {
  const called: string[] = [];
  const attempts = await runGeminiWaterfall(async (model) => {
    called.push(model);
    throw { status: 429 };
  });
  assert.deepEqual(called, [GEMINI_WATERFALL[0]]);
  assert.equal(attempts[0].errorCode, 429);
});

test("Gemini waterfall reaches the fourth model when earlier models fail", async () => {
  const called: string[] = [];
  const attempts = await runGeminiWaterfall(async (model) => {
    called.push(model);
    if (model !== GEMINI_WATERFALL[3]) throw { status: 503 };
    return { text: '{"yearBuilt":1988,"losses":3}' };
  });
  assert.deepEqual(called, GEMINI_WATERFALL);
  assert.deepEqual(attempts.map((attempt) => attempt.status), ["failed", "failed", "failed", "completed"]);
});

test("only recoverable Gemini errors fall through", () => {
  assert.equal(shouldFallThroughGeminiError({ status: 503 }), true);
  assert.equal(shouldFallThroughGeminiError({ status: 404 }), true);
  assert.equal(shouldFallThroughGeminiError({ status: 429 }), false);
  assert.equal(shouldFallThroughGeminiError({ status: 401 }), false);
  assert.equal(shouldFallThroughGeminiError({ status: 400 }), false);
});
