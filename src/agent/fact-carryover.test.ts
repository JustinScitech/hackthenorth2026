import assert from "node:assert/strict";
import test from "node:test";
import { carryForwardFacts } from "./fact-carryover";
import type { AppetiteFieldFacts, Facts } from "../lib/types";

const model = "Broker text via Gemini gemini-3.5-flash";
const none = { value: null, source: "Not provided", confidence: 0 };
const appetite = (fields: AppetiteFieldFacts, value: Record<string, unknown>) => ({
  value: { business: null, line: null, premium: null, constructionPercent: null, lossValue: null, lossHistoryComplete: false, effective: null, expiration: null, account: "Harbor Point", ...value },
  source: "Intake and explicit broker appetite fields (USD)", confidence: 0, fields,
}) as NonNullable<Facts["appetite"]>;

const previous: Facts = {
  state: { value: "TX", source: "Intake form", confidence: 1 },
  tiv: { value: 12_500_000, source: "Intake form", confidence: 1 },
  yearBuilt: { value: 1996, source: model, confidence: 0.9, quote: "The building was constructed in 1996." },
  losses: { value: 2, source: model, confidence: 0.9 },
  appetite: appetite({ premium: { value: 62_000, source: model, confidence: 0.75, quote: "Premium's about 62k for the year." }, business: { value: "renewal", source: model, confidence: 0.75 }, lossHistoryComplete: { value: true, source: model, confidence: 0.75 }, lossValue: none }, { premium: 62_000, business: "renewal", lossHistoryComplete: true }),
};
/** The parser-only re-read: it still finds the year, and reads an explicit loss-value line the broker just sent, but none of the prose. */
const parserOnly: Facts = {
  state: previous.state, tiv: previous.tiv,
  yearBuilt: { value: 1996, source: "Broker text via Parser", confidence: 0.6 },
  losses: none,
  appetite: appetite({ premium: none, business: none, lossHistoryComplete: none, lossValue: { value: 61_500, source: "Broker reply line", confidence: 0.6 } }, { lossValue: 61_500 }),
};

test("when no model answered, facts only a model had read are carried forward and the new explicit line still wins", () => {
  const { facts, carried } = carryForwardFacts(previous, parserOnly, false);
  assert.deepEqual(carried, ["Recent loss count", "Business type", "Premium", "Five-year history complete"]);
  assert.equal(facts.yearBuilt.source, "Broker text via Parser", "a value the parser read this time is not replaced");
  assert.deepEqual(facts.losses, previous.losses);
  assert.deepEqual(facts.appetite?.fields?.premium, previous.appetite?.fields?.premium, "the carried fact keeps its source, confidence, and quote");
  assert.equal(facts.appetite?.fields?.lossValue?.value, 61_500, "the broker's new line is kept");
  const merged = facts.appetite?.value;
  assert.deepEqual({ premium: merged?.premium, business: merged?.business, lossHistoryComplete: merged?.lossHistoryComplete, lossValue: merged?.lossValue }, { premium: 62_000, business: "renewal", lossHistoryComplete: true, lossValue: 61_500 }, "the merged appetite the scorer reads agrees with the fields");
  assert.equal(parserOnly.appetite?.fields?.premium?.value, null, "the input is not mutated");
});

test("when a model answered, its fresh reading stands even where it now leaves a field unknown", () => {
  const { facts, carried } = carryForwardFacts(previous, parserOnly, true);
  assert.deepEqual(carried, []);
  assert.equal(facts, parserOnly);
});

test("a first revision or a previous revision that knew nothing carries nothing", () => {
  assert.deepEqual(carryForwardFacts(null, parserOnly, false), { facts: parserOnly, carried: [] });
  const empty: Facts = { ...parserOnly, yearBuilt: none, losses: none, appetite: appetite({ premium: none, business: none }, {}) };
  const { carried } = carryForwardFacts(empty, parserOnly, false);
  assert.deepEqual(carried, []);
});
