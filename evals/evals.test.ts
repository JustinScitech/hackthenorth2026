import assert from "node:assert/strict";
import test from "node:test";
import { checkRatchet, defaultOptions, formatScorecard, loadBaseline, runSuites, type Scorecard } from "./runner";
import { suites } from "./suites";

/**
 * Runs the offline eval suites inside `npm test` and enforces the ratchet:
 * no case that passes in evals/baseline.json may fail, and no known failure
 * may silently start passing without the baseline being updated.
 */
test("agent evals hold the baseline ratchet", async () => {
  const scorecard = await runSuites(suites, defaultOptions({ extractor: "parser" }));
  const baseline = loadBaseline();
  const violations = checkRatchet(scorecard, baseline);
  assert.deepEqual(violations, [], `${formatScorecard(scorecard, baseline)}\n\n${violations.map((item) => `${item.kind} [${item.suite}] ${item.name}${item.detail ? `: ${item.detail}` : ""}`).join("\n")}`);
  assert.ok(scorecard.suites.every((suite) => suite.total > 0), "every suite must have cases");
});

test("ratchet detects regressions and stale known failures", () => {
  const scorecard: Scorecard = { generatedAt: "", extractor: "parser", suites: [{ name: "s", description: "", passed: 1, total: 2, metrics: {}, cases: [{ name: "a", passed: true }, { name: "b", passed: false, detail: "boom" }] }] };
  assert.deepEqual(checkRatchet(scorecard, { knownFailures: { s: ["b"] } }), []);
  assert.deepEqual(checkRatchet(scorecard, { knownFailures: {} }).map((item) => item.kind), ["regression"]);
  assert.deepEqual(checkRatchet(scorecard, { knownFailures: { s: ["a", "b", "gone"] } }).map((item) => [item.kind, item.name]), [["stale_baseline", "a"], ["stale_baseline", "gone"]]);
});
