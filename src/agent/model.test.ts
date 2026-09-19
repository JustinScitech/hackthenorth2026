import assert from "node:assert/strict";
import test from "node:test";
import { extractionConflicts } from "./model";

test("flags differing values without treating missing values as a contradiction", () => {
  assert.deepEqual(extractionConflicts([
    { source: "Parser", value: { yearBuilt: 1998, losses: null } },
    { source: "Gemini", value: { yearBuilt: 2001, losses: 0 } },
  ]), ["Year built differs: Parser 1998, Gemini 2001."]);
});
