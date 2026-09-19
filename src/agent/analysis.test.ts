import assert from "node:assert/strict";
import test from "node:test";
import { buildFacts, evaluateFacts, parseBrokerNotes } from "./analysis";

test("extracts explicit construction year and loss count", () => {
  assert.deepEqual(parseBrokerNotes("Constructed in 1998. Losses: 0 in the past three years."), { yearBuilt: 1998, losses: 0 });
  assert.deepEqual(parseBrokerNotes("Built in 1998. Loss information to follow. The property had 0 losses in the past three years."), { yearBuilt: 1998, losses: 0 });
});

test("does not mistake a dollar loss value for a claim count", () => {
  assert.deepEqual(parseBrokerNotes("Loss value: $100,000. Claim count is not provided."), { yearBuilt: null, losses: null });
});

test("understands written year windows and lets later notes supersede earlier claim counts", () => {
  assert.deepEqual(parseBrokerNotes("Built in 1998. Initial note: 3 claims. Broker update: claims in the past three years: 0."), { yearBuilt: 1998, losses: 0 });
});

test("missing loss history asks the broker and remains unknown", () => {
  const facts = buildFacts({ state: "PA", tiv: 3_200_000, yearBuilt: null, losses: null }, parseBrokerNotes("Built in 1998. Loss information to follow."));
  const result = evaluateFacts(facts);
  assert.equal(result.findings.find((finding) => finding.id === "losses")?.result, "unknown");
  assert.match(result.question ?? "", /number of losses/i);
});

test("out-of-guideline risks are referred, not automatically approved", () => {
  const facts = buildFacts({ state: "CA", tiv: 8_000_000, yearBuilt: 1972, losses: 3 }, { yearBuilt: null, losses: null });
  const result = evaluateFacts(facts);
  assert.equal(result.question, null);
  assert.equal(result.findings.filter((finding) => finding.result === "refer").length, 4);
  assert.match(result.brief, /4 guideline exceptions require/);
});

test("demo guideline thresholds are inclusive at their stated limits", () => {
  const atLimit = evaluateFacts(buildFacts({ state: "NJ", tiv: 5_000_000, yearBuilt: 1980, losses: 2 }, { yearBuilt: null, losses: null }));
  assert.deepEqual(atLimit.findings.map((finding) => finding.result), ["pass", "pass", "pass", "pass"]);
  assert.equal(atLimit.question, null);

  const outside = evaluateFacts(buildFacts({ state: "CO", tiv: 5_000_001, yearBuilt: 1979, losses: 3 }, { yearBuilt: null, losses: null }));
  assert.deepEqual(outside.findings.map((finding) => finding.result), ["refer", "refer", "refer", "refer"]);
});

test("intake facts take precedence over conflicting broker text", () => {
  const parsed = parseBrokerNotes("Built in 1998. Three claims: 3. Later corrected: built in 2001. No losses.");
  assert.deepEqual(parsed, { yearBuilt: 2001, losses: 0 });
  const facts = buildFacts({ state: "NY", tiv: 2_000_000, yearBuilt: 2012, losses: 1 }, parsed);
  assert.deepEqual(facts.yearBuilt, { value: 2012, source: "Intake form", confidence: 1 });
  assert.deepEqual(facts.losses, { value: 1, source: "Intake form", confidence: 1 });
});
