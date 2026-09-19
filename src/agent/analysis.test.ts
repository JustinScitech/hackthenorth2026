import assert from "node:assert/strict";
import test from "node:test";
import { buildFacts, evaluateFacts, parseBrokerNotes } from "./analysis";

test("extracts explicit construction year and loss count", () => {
  assert.deepEqual(parseBrokerNotes("Constructed in 1998. Losses: 0 in the past three years."), { yearBuilt: 1998, losses: 0 });
  assert.deepEqual(parseBrokerNotes("Built in 1998. Loss information to follow. The property had 0 losses in the past three years."), { yearBuilt: 1998, losses: 0 });
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
