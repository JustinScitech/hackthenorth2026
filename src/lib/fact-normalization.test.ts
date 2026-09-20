import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFact, normalizeState } from "./fact-normalization";

test("legacy missing values have no source or confidence", () => {
  for (const value of [null, undefined, "null", " NULL ", "undefined", ""]) {
    assert.deepEqual(normalizeFact({ value, source: "Intake form", confidence: 1 }), { value: null, source: "Not provided", confidence: 0 });
    assert.equal(normalizeState(value), null);
  }
  assert.equal(normalizeState(" ca "), "CA");
});

test("normalization preserves valid zero, false and provenance", () => {
  for (const value of [0, false, "CA", 1996]) {
    const fact = { value, source: "Intake form", confidence: 1 };
    assert.deepEqual(normalizeFact(fact), fact);
  }
});
