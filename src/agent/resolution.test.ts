import assert from "node:assert/strict";
import test from "node:test";
import { resolveField, type FieldCandidate } from "./resolution";

const gemini = <T extends string | number | boolean>(value: T | null, quote?: string | null): FieldCandidate<T> => ({ source: "Gemini gemini-3.8-flash", kind: "model", value, quote });
const openai = <T extends string | number | boolean>(value: T | null, quote?: string | null): FieldCandidate<T> => ({ source: "OpenAI gpt-5-mini", kind: "model", value, quote });
const parser = <T extends string | number | boolean>(value: T | null, quote?: string | null): FieldCandidate<T> => ({ source: "Parser", kind: "parser", value, quote });

test("resolves string, boolean, and date-shaped fields with the same agreement rules as numbers", () => {
  const business = resolveField("Business type", [gemini("new"), openai("renewal"), parser("new")]);
  assert.equal(business.value, "new");
  assert.match(business.conflict ?? "", /Business type differs: .*OpenAI gpt-5-mini renewal/);
  const complete = resolveField("Five-year history complete", [gemini(true), parser(true)]);
  assert.deepEqual([complete.value, complete.confidence, complete.conflict], [true, 0.9, null]);
  const unstated = resolveField("Five-year history complete", [gemini<boolean>(null), parser<boolean>(null)]);
  assert.deepEqual([unstated.value, unstated.source, unstated.confidence], [null, "Not provided", 0]);
  const effective = resolveField("Effective date", [gemini("2026-01-01"), parser<string>(null)]);
  assert.deepEqual([effective.value, effective.source], ["2026-01-01", "Gemini gemini-3.8-flash"]);
});

test("false is a stated value, not a missing one", () => {
  const result = resolveField("Five-year history complete", [gemini(false), parser<boolean>(null)]);
  assert.equal(result.value, false);
  assert.equal(result.confidence, 0.75);
});

test("the winning quote comes from a backer of the winning value, models first", () => {
  const result = resolveField("Premium", [gemini(85_000, "Premium: $85,000 annual."), openai(90_000, "The premium is $90,000."), parser(85_000, "Premium: $85,000 annual.")]);
  assert.equal(result.value, 85_000);
  assert.equal(result.quote, "Premium: $85,000 annual.");
  const parserOnlyQuote = resolveField("Premium", [gemini(85_000, null), parser(85_000, "Premium: $85,000 annual.")]);
  assert.equal(parserOnlyQuote.quote, "Premium: $85,000 annual.");
  const none = resolveField("Premium", [gemini(85_000), parser(85_000)]);
  assert.equal(none.quote, null);
});

test("a dissenter's quote is never attached to the winning value", () => {
  const result = resolveField("Year built", [gemini(2005), openai(1988, "Built in 1988."), parser(2005)]);
  assert.equal(result.value, 2005);
  assert.equal(result.quote, null);
});

test("every stated candidate is listed with its quote so the reviewer can see the disagreement", () => {
  const result = resolveField("Year built", [gemini(2005, "Constructed in 2005."), openai(1988, "Built in 1988."), parser<number>(null)]);
  assert.deepEqual(result.candidates, [
    { source: "Gemini gemini-3.8-flash", value: 2005, quote: "Constructed in 2005." },
    { source: "OpenAI gpt-5-mini", value: 1988, quote: "Built in 1988." },
  ]);
  assert.deepEqual(resolveField("Year built", [gemini<number>(null)]).candidates, []);
});
