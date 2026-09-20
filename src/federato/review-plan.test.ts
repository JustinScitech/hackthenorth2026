import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewPlan, summarizeQueue } from "./review-plan";
import type { RankedSubmission } from "./scoring";

const item: RankedSubmission = { id: "1", account: "Test", score: 49, rawScore: 70, recommendation: "Review", explanation: "", missingData: ["Five-year loss value", "effective date"], criteria: [
  { concept: "lossValue", factor: "Five-year loss value", status: "unknown", points: 0, maximum: 10, detail: "Incomplete history", source: "claims" },
  { concept: "state", factor: "Primary risk state", status: "outside", points: 0, maximum: 15, detail: "Observed NY", source: "state" },
] };

test("review plans preserve exceptions alongside missing evidence without duplicating tasks", () => {
  const before = JSON.stringify(item);
  const plan = buildReviewPlan(item);
  assert.equal(plan.tasks.length, 3);
  assert.equal(plan.exceptions, 1);
  assert.equal(plan.gaps, 2);
  assert.equal(plan.assessed, 1);
  assert.equal(plan.tasks[0].source, "state");
  assert.match(plan.tasks[0].action, /does not waive/);
  assert.match(plan.tasks[1].action, /five-year account loss runs/);
  assert.equal(JSON.stringify(item), before);
});

test("queue totals are exclusive while evidence gaps include exception records", () => {
  const complete = { ...item, missingData: [], criteria: [{ ...item.criteria[1], status: "acceptable" as const }] };
  const incomplete = { ...item, criteria: [item.criteria[0]] };
  assert.deepEqual(summarizeQueue([item, complete, incomplete]), { ready: 1, incomplete: 1, exceptions: 1, withEvidenceGaps: 2 });
  assert.deepEqual(buildReviewPlan(complete).tasks, []);
  assert.equal(summarizeQueue([{ ...complete, criteria: [] }]).ready, 0);
  assert.deepEqual(summarizeQueue([]), { ready: 0, incomplete: 0, exceptions: 0, withEvidenceGaps: 0 });
});
