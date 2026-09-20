import assert from "node:assert/strict";
import test from "node:test";
import { caseAppetiteSchema, mergeCaseAppetite } from "./case-appetite";

test("blank intake fields preserve explicit broker appetite values", () => {
  const result = mergeCaseAppetite("Premium: 85000\nBusiness type: new\nLine of business: property\nEligible construction percent: 75", caseAppetiteSchema.parse({}));
  assert.equal(result.premium, 85000);
  assert.equal(result.business, "new");
  assert.equal(result.line, "property");
  assert.equal(result.constructionPercent, 75);
});

test("supplied intake values, including zero and false, override original notes", () => {
  const result = mergeCaseAppetite("Premium: 85000\nFive-year loss value: 50000\nFive-year history complete: yes", { premium: 95000, lossValue: 0, lossHistoryComplete: false });
  assert.equal(result.premium, 95000);
  assert.equal(result.lossValue, 0);
  assert.equal(result.lossHistoryComplete, false);
});

test("later broker replies supersede intake and preserve unknowns", () => {
  const result = mergeCaseAppetite("Premium: 85000", { premium: 95000 }, "Premium: 105000\nFive-year history complete: no");
  assert.equal(result.premium, 105000);
  assert.equal(result.lossHistoryComplete, false);
  assert.equal(mergeCaseAppetite("", null).premium, null);
  assert.equal(mergeCaseAppetite("Premium: 85000", undefined, "Premium: unknown").premium, null);
});
