import assert from "node:assert/strict";
import test from "node:test";
import { buildSummaryMarkdown, summarizeSubmission } from "./presentation";
import type { RankedSubmission } from "./scoring";

const item: RankedSubmission = {
  id: "1", account: "Example Office", score: 69, rawScore: 69, recommendation: "Investigate missing or ambiguous data", missingData: ["Premium"],
  explanation: "technical detail", criteria: [
    { concept: "state", factor: "Primary risk state", status: "target", points: 15, maximum: 15, detail: "Target state", source: "state" },
    { concept: "premium", factor: "Total premium", status: "unknown", points: 0, maximum: 15, detail: "Missing", source: "premium" },
  ],
};

test("submission summaries translate scores into an understandable next action", () => {
  const summary = summarizeSubmission(item);
  assert.equal(summary.title, "Needs more information");
  assert.equal(summary.action, "Ask for the missing information");
  assert.deepEqual(summary.strengths, ["Primary risk state"]);
  assert.deepEqual(summary.questions, ["Total premium"]);
  assert.match(summary.plainExplanation, /incomplete/);
});

test("download summary is readable without technical API details", () => {
  const markdown = buildSummaryMarkdown({ generatedAt: "2026-09-19T00:00:00Z", evaluated: 1, total: 1, topSubmissions: [item] });
  assert.match(markdown, /Underwriting queue summary/);
  assert.match(markdown, /Recommended next step/);
  assert.doesNotMatch(markdown, /technical detail/);
});

test("appetite exceptions are explained as a human review decision", () => {
  const result = summarizeSubmission({
    ...item,
    account: "Out of territory warehouse",
    recommendation: "Refer for appetite exceptions",
    criteria: [{ concept: "state", factor: "Primary risk state", status: "outside", points: 0, maximum: 15, detail: "Outside", source: "state" }],
  });
  assert.equal(result.status, "refer");
  assert.equal(result.title, "Needs an appetite exception");
  assert.equal(result.action, "Refer for an appetite exception");
  assert.match(result.plainExplanation, /does not fit/);
});

test("complete matches do not ask the reviewer for unnecessary follow-up", () => {
  const result = summarizeSubmission({
    ...item,
    score: 100,
    recommendation: "Review for acceptance",
    criteria: [{ concept: "state", factor: "Primary risk state", status: "target", points: 15, maximum: 15, detail: "Target", source: "state" }],
  });
  assert.equal(result.status, "positive");
  assert.deepEqual(result.questions, []);
  assert.equal(result.action, "Review for acceptance");
});
