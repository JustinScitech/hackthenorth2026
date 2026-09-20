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

test("buildFacts carries extraction provenance: winning source, confidence, and the quote behind the value", () => {
  const gemini = "Gemini gemini-3.8-flash";
  const facts = buildFacts({ state: "PA", tiv: 3_200_000, yearBuilt: null, losses: null }, { yearBuilt: 1998, losses: 0 }, {
    yearBuilt: { source: gemini, confidence: 0.9, quote: "Built in 1998.", candidates: [{ source: gemini, value: 1998, quote: "Built in 1998." }, { source: "Parser", value: 1998, quote: "Built in 1998." }] },
    losses: { source: gemini, confidence: 0.5, quote: null, candidates: [{ source: gemini, value: 0 }, { source: "Parser", value: 2, quote: "2 claims." }] },
  });
  assert.deepEqual(facts.yearBuilt, { value: 1998, source: `Broker text via ${gemini}`, confidence: 0.9, quote: "Built in 1998." });
  assert.deepEqual(facts.losses, { value: 0, source: `Broker text via ${gemini}`, confidence: 0.5, candidates: [{ source: gemini, value: 0 }, { source: "Parser", value: 2, quote: "2 claims." }] });
  assert.deepEqual(buildFacts({ state: "PA", tiv: 1, yearBuilt: null, losses: null }, { yearBuilt: null, losses: null }, { yearBuilt: { source: "Not provided", confidence: 0, quote: null, candidates: [] } }).yearBuilt, { value: null, source: "Not provided", confidence: 0 });
});

test("the intake still wins, and readers that disagree with it are listed beside the fact", () => {
  const facts = buildFacts({ state: "NY", tiv: 2_000_000, yearBuilt: 2012, losses: 1 }, { yearBuilt: 1970, losses: 1 }, {
    yearBuilt: { source: "Parser", confidence: 0.6, quote: "Built in 1970.", candidates: [{ source: "Parser", value: 1970, quote: "Built in 1970." }] },
    losses: { source: "Parser", confidence: 0.6, quote: null, candidates: [{ source: "Parser", value: 1 }] },
  });
  assert.deepEqual(facts.yearBuilt, { value: 2012, source: "Intake form", confidence: 1, candidates: [{ source: "Parser", value: 1970, quote: "Built in 1970." }] });
  assert.deepEqual(facts.losses, { value: 1, source: "Intake form", confidence: 1 });
});

test("per-field appetite facts ride along and name the source of each appetite finding", () => {
  const premium = { value: 85_000, source: "Broker text via Gemini gemini-3.8-flash", confidence: 0.75, quote: "The premium is $85,000." };
  const facts = buildFacts({ insuredName: "Quoted", appetite, state: "CO", tiv: 75_000_000, yearBuilt: 2015, losses: 0 }, { yearBuilt: null, losses: null }, { appetite: { premium, business: { value: null, source: "Not provided", confidence: 0 } } });
  assert.deepEqual(facts.appetite?.fields?.premium, premium);
  const result = evaluateFacts(facts);
  assert.equal(result.findings.find((finding) => finding.id === "premium")?.source, premium.source);
  assert.equal(result.findings.find((finding) => finding.id === "line")?.source, facts.appetite?.source, "fields without provenance keep the shared appetite source");
  assert.equal(result.findings.find((finding) => finding.id === "year")?.source, "Intake form");
  assert.equal(buildFacts({ state: "CO", tiv: 1, yearBuilt: null, losses: null }, { yearBuilt: null, losses: null }).appetite?.fields, undefined);
});
