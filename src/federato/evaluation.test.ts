import assert from "node:assert/strict";
import test from "node:test";
import { runUnderwritingEvaluation } from "./evaluation";

test("underwriting evaluation corpus passes appetite, exception, and uncertainty cases", () => {
  const results = runUnderwritingEvaluation();
  assert.equal(results.length, 5);
  assert.ok(results.every((item) => item.passed), results.filter((item) => !item.passed).map((item) => `${item.name}: ${item.result.recommendation}`).join("\n"));
  assert.match(results[0].result.criteria[0].detail, /renewal/);
  assert.match(results[2].result.explanation, /premium/);
});
