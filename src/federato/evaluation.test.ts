import assert from "node:assert/strict";
import test from "node:test";
import { runUnderwritingEvaluation, underwritingEvaluationCorpus } from "./evaluation";

test("versioned underwriting corpus checks every factor, recommendation, score, and evidence", () => {
  const results = runUnderwritingEvaluation();
  assert.ok(results.length >= 15);
  assert.ok(underwritingEvaluationCorpus.source.title);
  assert.deepEqual(results.filter((item) => !item.passed).map((item) => `${item.id}: ${item.failures.join("; ")}`), []);
});
