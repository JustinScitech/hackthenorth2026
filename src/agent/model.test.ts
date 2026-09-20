import assert from "node:assert/strict";
import test from "node:test";
import { EXTRACTION_FIELDS, emptyReading, parseModelOutput, type Reading } from "./extraction-schema";
import { assembleExtraction, extractNotes, extractionConflicts, GEMINI_WATERFALL, runGeminiWaterfall, shouldFallThroughGeminiError, type ModelAttempt } from "./model";

const note = "Premium: $85,000\nThe building was constructed in 2005 and had no losses in the past three years.";
const completed = (source: "Gemini" | "OpenAI", model: string, raw: Record<string, unknown>, text = note): ModelAttempt => {
  const reading = parseModelOutput(raw, text)!;
  return { source, model, status: "completed", durationMs: 1, reading, value: Object.fromEntries(EXTRACTION_FIELDS.map((field) => [field, reading[field].value])) as ModelAttempt["value"] };
};

test("flags differing values on any field without treating missing values as a contradiction", () => {
  assert.deepEqual(extractionConflicts([
    { source: "Parser", value: { ...values(emptyReading()), yearBuilt: 1998, premium: 85_000 } },
    { source: "Gemini", value: { ...values(emptyReading()), yearBuilt: 2001, losses: 0, premium: 85_000, business: "new" } },
  ]), ["Year built differs: Parser 1998, Gemini 2001."]);
});

test("parser fallback is labeled when no model is configured, on every field", async () => {
  await withoutKeys(async () => {
    const result = await extractNotes(note);
    assert.deepEqual(result.extracted, { ...values(emptyReading()), yearBuilt: 2005, losses: 0, premium: 85_000 });
    assert.deepEqual(Object.keys(result.fieldSources), EXTRACTION_FIELDS);
    assert.deepEqual([result.fieldSources.yearBuilt, result.fieldSources.losses, result.fieldSources.premium, result.fieldSources.business], ["Parser", "Parser", "Parser", "Not provided"]);
    assert.deepEqual([result.confidence.yearBuilt, result.confidence.premium, result.confidence.business], [0.6, 0.6, 0]);
    assert.deepEqual([result.quotes.yearBuilt, result.quotes.premium, result.quotes.business], ["The building was constructed in 2005 and had no losses in the past three years.", "Premium: $85,000", null]);
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(result.attempts.map((attempt) => `${attempt.source}:${attempt.status}`), ["Gemini:not_configured", "OpenAI:not_configured"]);
  });
});

test("Gemini waterfall uses the next model after a transient failure", async () => {
  const called: string[] = [];
  const events: string[] = [];
  const attempts = await runGeminiWaterfall(async (model) => {
    called.push(model);
    if (model === GEMINI_WATERFALL[0]) throw { status: 503 };
    return { text: '{"yearBuilt":{"value":2005,"quote":"The building was constructed in 2005 and had no losses in the past three years."},"losses":{"value":0,"quote":null}}', modelVersion: model };
  }, async (event, attempt) => { events.push(`${event}:${attempt.model}`); }, GEMINI_WATERFALL, note);
  assert.deepEqual(called, GEMINI_WATERFALL.slice(0, 2));
  assert.deepEqual(attempts.map((attempt) => attempt.status), ["failed", "completed"]);
  assert.deepEqual(events, ["started:gemini-3.8-flash", "failed:gemini-3.8-flash", "started:gemini-3.7-flash", "completed:gemini-3.7-flash"]);
  assert.equal(attempts[1].value?.yearBuilt, 2005);
  assert.equal(attempts[1].reading?.yearBuilt.quote, "The building was constructed in 2005 and had no losses in the past three years.");
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
    return { text: '{"yearBuilt":{"value":1988,"quote":null},"losses":{"value":3,"quote":null}}' };
  });
  assert.deepEqual(called, GEMINI_WATERFALL);
  assert.deepEqual(attempts.map((attempt) => attempt.status), ["failed", "failed", "failed", "completed"]);
});

test("malformed JSON and non-object responses fail the attempt, not the job, and the waterfall moves on", async () => {
  const bodies = ["{not json", '["yearBuilt", 2005]', '{"yearBuilt":{"value":"nineteen ninety","quote":null},"losses":{"value":0,"quote":"No losses in the past three years"}}'];
  const attempts = await runGeminiWaterfall(async () => ({ text: bodies.shift() }), undefined, GEMINI_WATERFALL, note);
  assert.deepEqual(attempts.map((attempt) => attempt.status), ["failed", "failed", "completed"]);
  assert.equal(attempts[2].value?.yearBuilt, null, "a malformed field is dropped");
  assert.equal(attempts[2].value?.losses, 0, "the rest of the reading survives");
  assert.equal(attempts[2].reading?.losses.quote, null, "a quote that changes the text's casing is not verbatim");
  const empty = await runGeminiWaterfall(async () => ({ text: "" }), undefined, [GEMINI_WATERFALL[0]], note);
  assert.equal(empty[0].status, "failed");
});

test("only recoverable Gemini errors fall through", () => {
  assert.equal(shouldFallThroughGeminiError({ status: 503 }), true);
  assert.equal(shouldFallThroughGeminiError({ status: 404 }), true);
  assert.equal(shouldFallThroughGeminiError({ status: 429 }), false);
  assert.equal(shouldFallThroughGeminiError({ status: 401 }), false);
  assert.equal(shouldFallThroughGeminiError({ status: 400 }), false);
});

test("assembled extraction resolves every field across models and the parser, keeping the winning quote", () => {
  const gemini = completed("Gemini", "gemini-3.8-flash", {
    yearBuilt: { value: 2005, quote: "The building was constructed in 2005 and had no losses in the past three years." },
    losses: { value: 0, quote: "The building was constructed in 2005 and had no losses in the past three years." },
    premium: { value: 85000, quote: "Premium: $85,000" },
    business: { value: "new", quote: null },
  });
  const openai = completed("OpenAI", "gpt-5-mini", {
    yearBuilt: { value: 2005, quote: "The building was constructed in 2005 and had no losses in the past three years." },
    losses: { value: 1, quote: null },
    premium: { value: 85000, quote: "Premium: $85,000" },
    business: { value: "renewal", quote: null },
  });
  const failed: ModelAttempt = { source: "Gemini", model: "gemini-3.9-flash", status: "failed", durationMs: 1, errorCode: 503 };
  const result = assembleExtraction(note, [failed, gemini, openai]);
  assert.deepEqual(result.sources, ["Gemini gemini-3.8-flash", "OpenAI gpt-5-mini", "Parser"]);
  assert.deepEqual([result.extracted.yearBuilt, result.confidence.yearBuilt, result.fieldSources.yearBuilt], [2005, 0.95, "Gemini gemini-3.8-flash"]);
  assert.deepEqual([result.extracted.losses, result.confidence.losses, result.fieldSources.losses], [0, 0.85, "Gemini gemini-3.8-flash"]);
  assert.deepEqual([result.extracted.premium, result.confidence.premium, result.quotes.premium], [85000, 0.95, "Premium: $85,000"]);
  assert.deepEqual([result.extracted.business, result.confidence.business, result.quotes.business], ["new", 0.5, null]);
  assert.deepEqual(result.conflicts, ["Recent loss count differs: Gemini gemini-3.8-flash 0, OpenAI gpt-5-mini 1, Parser 0.", "Business type differs: Gemini gemini-3.8-flash new, OpenAI gpt-5-mini renewal."]);
  assert.deepEqual(result.fields.business.candidates, [{ source: "Gemini gemini-3.8-flash", value: "new" }, { source: "OpenAI gpt-5-mini", value: "renewal" }]);
  assert.equal(result.extracted.lossValue, null);
  assert.equal(result.fieldSources.lossValue, "Not provided");
});

function values(reading: Reading) {
  return Object.fromEntries(EXTRACTION_FIELDS.map((field) => [field, reading[field].value])) as ModelAttempt["value"] & object;
}

async function withoutKeys(run: () => Promise<void>) {
  const keys = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, OPENAI_API_KEY: process.env.OPENAI_API_KEY };
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await run();
  } finally {
    for (const [name, value] of Object.entries(keys)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
}
