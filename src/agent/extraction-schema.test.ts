import assert from "node:assert/strict";
import test from "node:test";
import { BROKER_UPDATE_SEPARATOR } from "./analysis";
import { EXTRACTION_FIELDS, EXTRACTION_PROMPT, FIELD_LABELS, emptyReading, openaiSchema, parseModelOutput, parserReading, quoteInText, readingValues, resolveReadings } from "./extraction-schema";

const note = "Business type: new\nLine of business: Property\nPremium: $85,000\nEligible construction percent: 75%\nFive-year loss value: $12,000\nFive-year history complete: yes\nEffective date: 2026-01-01\nExpiration date: 2027-01-01\nThe warehouse was constructed in 2005. No losses in the past three years.";

test("the field list covers every appetite field plus year built and losses, each with a label the broker would recognise", () => {
  assert.deepEqual(EXTRACTION_FIELDS, ["yearBuilt", "losses", "business", "line", "premium", "constructionPercent", "lossValue", "lossHistoryComplete", "effective", "expiration"]);
  for (const field of EXTRACTION_FIELDS) assert.ok(FIELD_LABELS[field].length > 0, field);
  for (const field of EXTRACTION_FIELDS) assert.ok(EXTRACTION_PROMPT.includes(field), `prompt names ${field}`);
  assert.match(EXTRACTION_PROMPT, /verbatim/);
  assert.match(EXTRACTION_PROMPT, /null/);
});

test("the OpenAI schema is strict on every field and requires a value and a quote for each", () => {
  const schema = openaiSchema as { required: string[]; additionalProperties: boolean; properties: Record<string, { required: string[]; additionalProperties: boolean; properties: Record<string, unknown> }> };
  assert.deepEqual(schema.required, EXTRACTION_FIELDS);
  assert.equal(schema.additionalProperties, false);
  for (const field of EXTRACTION_FIELDS) {
    assert.deepEqual(schema.properties[field].required, ["value", "quote"], field);
    assert.equal(schema.properties[field].additionalProperties, false, field);
  }
});

test("a well-formed model reading keeps every value with its verbatim quote", () => {
  const reading = parseModelOutput({
    yearBuilt: { value: 2005, quote: "The warehouse was constructed in 2005." },
    losses: { value: 0, quote: "No losses in the past three years." },
    business: { value: "new", quote: "Business type: new" },
    line: { value: "Property", quote: "Line of business: Property" },
    premium: { value: 85000, quote: "Premium: $85,000" },
    constructionPercent: { value: 75, quote: "Eligible construction percent: 75%" },
    lossValue: { value: 12000, quote: "Five-year loss value: $12,000" },
    lossHistoryComplete: { value: true, quote: "Five-year history complete: yes" },
    effective: { value: "2026-01-01", quote: "Effective date: 2026-01-01" },
    expiration: { value: "2027-01-01", quote: "Expiration date: 2027-01-01" },
  }, note);
  assert.ok(reading);
  assert.deepEqual(readingValues(reading), { yearBuilt: 2005, losses: 0, business: "new", line: "property", premium: 85000, constructionPercent: 75, lossValue: 12000, lossHistoryComplete: true, effective: "2026-01-01", expiration: "2027-01-01" });
  assert.equal(reading.yearBuilt.quote, "The warehouse was constructed in 2005.");
  assert.equal(reading.line.quote, "Line of business: Property");
});

test("malformed fields are dropped one at a time instead of failing the reading", () => {
  const reading = parseModelOutput({
    yearBuilt: { value: "two thousand and five", quote: "The warehouse was constructed in 2005." },
    losses: { value: -1, quote: "No losses in the past three years." },
    business: { value: "renewal business", quote: "Business type: new" },
    line: { value: 42, quote: null },
    premium: { value: "85k", quote: "Premium: $85,000" },
    constructionPercent: { value: 175, quote: "Eligible construction percent: 75%" },
    lossValue: { value: 12000, quote: "Five-year loss value: $12,000" },
    lossHistoryComplete: { value: "yes", quote: "Five-year history complete: yes" },
    effective: { value: "January 1, 2026", quote: "Effective date: 2026-01-01" },
    expiration: 2027,
    somethingElse: { value: 1, quote: "x" },
  }, note);
  assert.ok(reading);
  assert.deepEqual(readingValues(reading), { yearBuilt: null, losses: null, business: null, line: null, premium: null, constructionPercent: null, lossValue: 12000, lossHistoryComplete: null, effective: null, expiration: null });
  assert.equal(reading.yearBuilt.quote, null, "a dropped value never keeps its quote");
  assert.equal(reading.lossValue.quote, "Five-year loss value: $12,000");
  assert.equal("somethingElse" in reading, false);
});

test("bare values and missing fields are tolerated, and enum casing is normalised", () => {
  const reading = parseModelOutput({ yearBuilt: 2005, business: "NEW", line: " Property ", lossHistoryComplete: false }, note);
  assert.ok(reading);
  assert.deepEqual(readingValues(reading), { ...readingValues(emptyReading()), yearBuilt: 2005, business: "new", line: "property", lossHistoryComplete: false });
  assert.equal(reading.yearBuilt.quote, null);
});

test("a quote that is not in the broker text is discarded, and a quote without a value is meaningless", () => {
  const reading = parseModelOutput({
    yearBuilt: { value: 2005, quote: "The building dates from 2005." },
    losses: { value: 0, quote: "no losses in the past three years" },
    premium: { value: 85000, quote: 12 },
    lossValue: { value: null, quote: "Five-year loss value: $12,000" },
    line: { value: "property", quote: "Line of business:\n  Property" },
  }, note);
  assert.ok(reading);
  assert.equal(reading.yearBuilt.value, 2005);
  assert.equal(reading.yearBuilt.quote, null, "paraphrases are not quotes");
  assert.equal(reading.losses.quote, null, "quotes are verbatim, including case");
  assert.equal(reading.premium.quote, null);
  assert.equal(reading.lossValue.quote, null);
  assert.equal(reading.line.quote, "Line of business: Property", "whitespace differences are forgiven and normalised");
});

test("a response that is not an object is rejected rather than read as ten nulls", () => {
  assert.equal(parseModelOutput([{ value: 2005 }], note), null);
  assert.equal(parseModelOutput("yearBuilt: 2005", note), null);
  assert.equal(parseModelOutput(null, note), null);
  assert.equal(parseModelOutput(7, note), null);
});

test("quoteInText forgives whitespace but nothing else", () => {
  assert.equal(quoteInText("No losses in the\npast three years.", note), true);
  assert.equal(quoteInText("no losses in the past three years.", note), false);
  assert.equal(quoteInText("", note), false);
  assert.equal(quoteInText("   ", note), false);
});

test("the parser reading takes explicit lines and sentences with their quotes", () => {
  const reading = parserReading(note);
  assert.deepEqual(readingValues(reading), { yearBuilt: 2005, losses: 0, business: "new", line: "property", premium: 85000, constructionPercent: 75, lossValue: 12000, lossHistoryComplete: true, effective: "2026-01-01", expiration: "2027-01-01" });
  assert.equal(reading.premium.quote, "Premium: $85,000");
  assert.equal(reading.line.quote, "Line of business: Property");
  assert.equal(reading.lossHistoryComplete.quote, "Five-year history complete: yes");
  assert.equal(reading.yearBuilt.quote, "The warehouse was constructed in 2005.");
  assert.equal(reading.losses.quote, "No losses in the past three years.");
  for (const field of EXTRACTION_FIELDS) {
    const quote = reading[field].quote;
    if (quote !== null) assert.ok(quoteInText(quote, note), `${field} quote "${quote}" is in the text`);
  }
});

test("the parser reading has no quote where it has no value, and a later line wins with its own quote", () => {
  const sparse = parserReading("Premium: unknown\nThe roof was replaced in 2019.");
  assert.deepEqual(readingValues(sparse), readingValues(emptyReading()));
  for (const field of EXTRACTION_FIELDS) assert.equal(sparse[field].quote, null, field);
  const updated = parserReading(`Premium: $85,000\nBuilt in 1972.${BROKER_UPDATE_SEPARATOR}Premium: $90,000\nCorrection: the building was constructed in 2004.`);
  assert.equal(updated.premium.value, 90000);
  assert.equal(updated.premium.quote, "Premium: $90,000");
  assert.equal(updated.yearBuilt.value, 2004);
  assert.equal(updated.yearBuilt.quote, "Correction: the building was constructed in 2004.");
  const words = parserReading("Constructed in 2003. Two claims were reported in the last three years, both closed.");
  assert.equal(words.losses.value, 2);
  assert.equal(words.losses.quote, "Two claims were reported in the last three years, both closed.");
  assert.equal(parserReading("").yearBuilt.quote, null);
});

test("resolveReadings runs every field through the resolver with models ahead of the parser", () => {
  const parser = parserReading(note);
  const gemini = parseModelOutput({ yearBuilt: { value: 2005, quote: "The warehouse was constructed in 2005." }, premium: { value: 90000, quote: null }, business: { value: "renewal", quote: null } }, note)!;
  const fields = resolveReadings([{ source: "Gemini gemini-3.8-flash", kind: "model", reading: gemini }, { source: "Parser", kind: "parser", reading: parser }]);
  assert.deepEqual(Object.keys(fields), EXTRACTION_FIELDS);
  assert.deepEqual([fields.yearBuilt.value, fields.yearBuilt.confidence, fields.yearBuilt.quote], [2005, 0.9, "The warehouse was constructed in 2005."]);
  assert.deepEqual([fields.premium.value, fields.premium.source, fields.premium.confidence], [90000, "Gemini gemini-3.8-flash", 0.5]);
  assert.equal(fields.premium.conflict, "Premium differs: Gemini gemini-3.8-flash 90000, Parser 85000.");
  assert.equal(fields.premium.quote, null, "the parser's quote backs a different value");
  assert.equal(fields.business.conflict, "Business type differs: Gemini gemini-3.8-flash renewal, Parser new.");
  assert.deepEqual([fields.lossValue.value, fields.lossValue.source, fields.lossValue.quote], [12000, "Parser", "Five-year loss value: $12,000"]);
  assert.deepEqual([fields.losses.value, fields.losses.confidence], [0, 0.6]);
});
