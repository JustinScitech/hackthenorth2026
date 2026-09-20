import assert from "node:assert/strict";
import test from "node:test";
import { APPETITE_FACT_ROWS, describeCandidate, formatFactValue } from "./fact-evidence";

test("appetite values are shown the way an underwriter reads them", () => {
  assert.equal(formatFactValue("premium", 85000), "$85,000");
  assert.equal(formatFactValue("lossValue", 0), "$0");
  assert.equal(formatFactValue("constructionPercent", 75), "75%");
  assert.equal(formatFactValue("lossHistoryComplete", true), "Yes");
  assert.equal(formatFactValue("lossHistoryComplete", false), "No");
  assert.equal(formatFactValue("business", "new"), "New");
  assert.equal(formatFactValue("line", "property"), "Property");
  assert.equal(formatFactValue("effective", "2026-01-01"), "2026-01-01");
  assert.equal(formatFactValue("yearBuilt", 1998), "1998");
  assert.equal(formatFactValue("losses", 2), "2");
});

test("every appetite field has a row with a label in the broker's vocabulary", () => {
  assert.deepEqual(APPETITE_FACT_ROWS.map(([field]) => field), ["business", "line", "premium", "constructionPercent", "lossValue", "lossHistoryComplete", "effective", "expiration"]);
  assert.deepEqual(APPETITE_FACT_ROWS.find(([field]) => field === "lossValue"), ["lossValue", "Five-year loss value"]);
});

test("a disagreeing reader is described with its value and its quote when it gave one", () => {
  assert.equal(describeCandidate("premium", { source: "OpenAI gpt-5-mini", value: 90000, quote: "The premium is $90,000." }), "OpenAI gpt-5-mini read $90,000");
  assert.equal(describeCandidate("yearBuilt", { source: "Parser", value: 1988 }), "Parser read 1988");
});
