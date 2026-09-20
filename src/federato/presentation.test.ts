import assert from "node:assert/strict";
import test from "node:test";
import { buildSummaryMarkdown, resourceLabels, summarizeSubmission } from "./presentation";
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
  assert.deepEqual(summary.questions, ["Total premium", "Premium"]);
  assert.match(summary.plainExplanation, /incomplete/);
});

test("download summary is readable without technical API details", () => {
  const markdown = buildSummaryMarkdown({ resource: "Policy", generatedAt: "2026-09-19T00:00:00Z", evaluated: 1, total: 1, topSubmissions: [{ ...item, rawScore: 78, score: 49 }] });
  assert.match(markdown, /Underwriting queue summary/);
  assert.match(markdown, /Recommended next step/);
  assert.doesNotMatch(markdown, /technical detail/);
  assert.match(markdown, /Policy 1/);
  assert.match(markdown, /1 of 1 policies/);
  assert.match(markdown, /Match score 78\/100 · Priority score 49\/100/);
  assert.match(markdown, /then underlying match score/);
});

test("appetite exceptions are explained as a human review decision", () => {
  const result = summarizeSubmission({
    ...item,
    account: "Out of territory warehouse",
    recommendation: "Refer for appetite exceptions",
    criteria: [{ concept: "state", factor: "Primary risk state", status: "outside", points: 0, maximum: 15, detail: "Observed NY; outside the accepted states.", source: "state" }],
  });
  assert.equal(result.status, "refer");
  assert.equal(result.title, "Outside appetite: underwriting review needed");
  assert.equal(result.action, "Refer for underwriting review: primary risk state outside appetite.");
  assert.match(result.plainExplanation, /sits outside/);
  assert.match(result.plainExplanation, /Observed NY/);
});

test("complete matches do not ask the reviewer for unnecessary follow-up", () => {
  const result = summarizeSubmission({
    ...item,
    score: 100,
    missingData: [],
    recommendation: "Review for acceptance",
    criteria: [{ concept: "state", factor: "Primary risk state", status: "target", points: 15, maximum: 15, detail: "Target", source: "state" }],
  });
  assert.equal(result.status, "positive");
  assert.deepEqual(result.questions, []);
  assert.equal(result.action, "Review for acceptance");
});

test("missing account context requires investigation even when all criteria match", () => {
  const result = summarizeSubmission({ ...item, missingData: ["effective date"], criteria: [item.criteria[0]] });
  assert.equal(result.status, "caution");
  assert.deepEqual(result.questions, ["effective date"]);
});

test("resource labels distinguish policies from standalone submissions", () => {
  assert.deepEqual(resourceLabels("Policy"), { singular: "Policy", plural: "policies" });
  assert.deepEqual(resourceLabels("Submission"), { singular: "Submission", plural: "submissions" });
});
