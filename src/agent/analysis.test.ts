import assert from "node:assert/strict";
import test from "node:test";
import { buildFacts, evaluateFacts, parseBrokerNotes } from "./analysis";
import { brokerAppetite, caseAppetiteSchema } from "../lib/case-appetite";

const appetite = caseAppetiteSchema.parse({ business: "new", line: "property", premium: 85_000, constructionPercent: 75, lossValue: 0, lossHistoryComplete: true, effective: "2026-01-01", expiration: "2027-01-01" });

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
  assert.equal(result.findings.find((finding) => finding.id === "lossValue")?.result, "unknown");
  assert.match(result.question ?? "", /Five-year loss value/i);
});

test("out-of-guideline risks are referred, not automatically approved", () => {
  const facts = buildFacts({ insuredName: "Outside property", appetite, state: "NY", tiv: 150_000_001, yearBuilt: 1972, losses: 3 }, { yearBuilt: null, losses: null });
  const result = evaluateFacts(facts);
  assert.equal(result.question, null);
  assert.equal(result.findings.filter((finding) => finding.result === "refer").length, 3);
  assert.equal(result.appetiteResult.recommendation, "Refer for appetite exceptions");
});

test("cases use all eight carrier rules and never treat claim count as loss dollars", () => {
  const atLimit = evaluateFacts(buildFacts({ insuredName: "Carrier match", appetite, state: "CO", tiv: 150_000_000, yearBuilt: 1991, losses: 2 }, { yearBuilt: null, losses: null }));
  assert.equal(atLimit.findings.length, 8);
  assert.ok(atLimit.findings.every((finding) => finding.result === "pass"));
  assert.equal(atLimit.question, null);

  const incomplete = evaluateFacts(buildFacts({ insuredName: "Incomplete", appetite: { ...appetite, lossHistoryComplete: false }, state: "CO", tiv: 5_000_001, yearBuilt: 2015, losses: 0 }, { yearBuilt: null, losses: null }));
  assert.equal(incomplete.findings.find((finding) => finding.id === "lossValue")?.result, "unknown");
  assert.equal(incomplete.appetiteResult.score, 69);
});

test("explicit broker corrections can supply dollars and completeness without converting counts", () => {
  const parsed = brokerAppetite("Premium: $85,000\nFive-year loss value: 0\nFive-year history complete: yes\nEligible construction percent: 75%\nBusiness type: renewal");
  assert.deepEqual(parsed, { premium: 85000, lossValue: 0, lossHistoryComplete: true, constructionPercent: 75, business: "renewal" });
  assert.deepEqual(brokerAppetite("No losses in the past three years."), {});
  assert.equal(brokerAppetite("Premium: 85000\nPremium: unknown").premium, null);
});

test("intake facts take precedence over conflicting broker text", () => {
  const parsed = parseBrokerNotes("Built in 1998. Three claims: 3. Later corrected: built in 2001. No losses.");
  assert.deepEqual(parsed, { yearBuilt: 2001, losses: 0 });
  const facts = buildFacts({ state: "NY", tiv: 2_000_000, yearBuilt: 2012, losses: 1 }, parsed);
  assert.deepEqual(facts.yearBuilt, { value: 2012, source: "Intake form", confidence: 1 });
  assert.deepEqual(facts.losses, { value: 1, source: "Intake form", confidence: 1 });
});
