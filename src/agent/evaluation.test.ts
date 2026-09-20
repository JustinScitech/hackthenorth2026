import assert from "node:assert/strict";
import test from "node:test";
import { buildFacts, evaluateFacts, parseBrokerNotes } from "./analysis";
import { loadAgentEvaluationCases } from "./evaluation";

test("versioned extraction samples have grounded expectations and exact carrier findings", () => {
  const cases = loadAgentEvaluationCases();
  assert.ok(cases.length >= 2);
  for (const item of cases) {
    // The parser's contract is the year and claim count; prose appetite expectations are scored by the extraction eval.
    assert.deepEqual(parseBrokerNotes(item.notes), { yearBuilt: item.expected.yearBuilt, losses: item.expected.losses }, item.id);
    const result = evaluateFacts(buildFacts(item.intake, item.expected));
    assert.deepEqual(Object.fromEntries(result.findings.map((finding) => [finding.id, finding.result])), item.expectedFindings, item.id);
    assert.equal(Boolean(result.question), item.needsBroker, item.id);
  }
});
