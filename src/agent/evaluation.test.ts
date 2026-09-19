import assert from "node:assert/strict";
import test from "node:test";
import { buildFacts, evaluateFacts, parseBrokerNotes } from "./analysis";
import { loadAgentEvaluationCases } from "./evaluation";

test("versioned extraction samples have grounded expectations and exact demo findings", () => {
  const cases = loadAgentEvaluationCases();
  assert.ok(cases.length >= 2);
  for (const item of cases) {
    assert.deepEqual(parseBrokerNotes(item.notes), item.expected, item.id);
    const result = evaluateFacts(buildFacts(item.intake, item.expected));
    assert.deepEqual(Object.fromEntries(result.findings.map((finding) => [finding.id, finding.result])), item.expectedFindings, item.id);
    assert.equal(Boolean(result.question), item.needsBroker, item.id);
  }
});
