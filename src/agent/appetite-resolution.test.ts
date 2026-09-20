import assert from "node:assert/strict";
import test from "node:test";
import { caseAppetiteSchema, mergeCaseAppetite } from "../lib/case-appetite";
import { resolveCaseAppetite, type ExtractedAppetite } from "./appetite-resolution";

const gemini = "Gemini gemini-3.8-flash";
const read = (value: string | number | boolean | null, source = gemini, quote: string | null = null, extra: Partial<ExtractedAppetite[keyof ExtractedAppetite] & object> = {}) =>
  ({ value, source, confidence: 0.75, quote, candidates: value === null ? [] : [{ source, value, ...(quote ? { quote } : {}) }], ...extra });

test("without extraction the values match mergeCaseAppetite and every field says where it came from", () => {
  const original = "Premium: $85,000\nBusiness type: new\nLine of business: property\nEligible construction percent: 75";
  const result = resolveCaseAppetite(original, undefined);
  assert.deepEqual(result.value, mergeCaseAppetite(original, undefined));
  assert.deepEqual(result.fields.premium, { value: 85000, source: "Broker note line", confidence: 0.6, quote: "Premium: $85,000" });
  assert.deepEqual(result.fields.business, { value: "new", source: "Broker note line", confidence: 0.6, quote: "Business type: new" });
  assert.deepEqual(result.fields.lossValue, { value: null, source: "Not provided", confidence: 0 });
  assert.deepEqual(result.fields.lossHistoryComplete, { value: null, source: "Not provided", confidence: 0 });
  assert.equal(result.value.lossHistoryComplete, false, "the merged appetite keeps the schema default");
  // A parsed intake form carries the schema default `false`, which the merge has always treated as supplied.
  assert.deepEqual(resolveCaseAppetite(original, caseAppetiteSchema.parse({})).fields.lossHistoryComplete, { value: false, source: "Intake form", confidence: 1 });
});

test("intake values, including zero and false, override the note and are attributed to the form", () => {
  const result = resolveCaseAppetite("Premium: 85000\nFive-year loss value: 50000\nFive-year history complete: yes", { premium: 95000, lossValue: 0, lossHistoryComplete: false });
  assert.deepEqual([result.value.premium, result.value.lossValue, result.value.lossHistoryComplete], [95000, 0, false]);
  assert.deepEqual(result.fields.premium, { value: 95000, source: "Intake form", confidence: 1 });
  assert.deepEqual(result.fields.lossValue, { value: 0, source: "Intake form", confidence: 1 });
  assert.deepEqual(result.fields.lossHistoryComplete, { value: false, source: "Intake form", confidence: 1 });
});

test("a broker reply line supersedes the intake, and an explicit unknown clears it", () => {
  const result = resolveCaseAppetite("Premium: 85000", { premium: 95000 }, "Premium: 105000\nFive-year history complete: no");
  assert.deepEqual(result.fields.premium, { value: 105000, source: "Broker reply line", confidence: 0.6, quote: "Premium: 105000" });
  assert.deepEqual(result.fields.lossHistoryComplete, { value: false, source: "Broker reply line", confidence: 0.6, quote: "Five-year history complete: no" });
  const cleared = resolveCaseAppetite("Premium: 85000", { premium: 95000 }, "Premium: unknown");
  assert.equal(cleared.value.premium, null);
  assert.deepEqual(cleared.fields.premium, { value: null, source: "Not provided", confidence: 0 });
});

test("a value the models read from prose fills a gap the parser cannot, with its quote", () => {
  const original = "The annual premium is $85,000 and this is new business.";
  const extracted: ExtractedAppetite = { premium: read(85000, gemini, "The annual premium is $85,000 and this is new business."), business: read("new", gemini, "The annual premium is $85,000 and this is new business.") };
  const result = resolveCaseAppetite(original, undefined, "", extracted);
  assert.equal(result.value.premium, 85000);
  assert.equal(result.value.business, "new");
  assert.deepEqual(result.value, mergeCaseAppetite(original, undefined, "", extracted));
  assert.deepEqual(result.fields.premium, { value: 85000, source: `Broker text via ${gemini}`, confidence: 0.75, quote: "The annual premium is $85,000 and this is new business." });
  assert.deepEqual(result.fields.line, { value: null, source: "Not provided", confidence: 0 });
});

test("the intake still wins over text the models read, and the disagreement is listed beside the value", () => {
  const extracted: ExtractedAppetite = { premium: read(90000, gemini, "The premium is $90,000.", { candidates: [{ source: gemini, value: 90000, quote: "The premium is $90,000." }, { source: "Parser", value: 85000, quote: "Premium: $85,000" }] }) };
  const result = resolveCaseAppetite("Premium: $85,000\nThe premium is $90,000.", { premium: 95000 }, "", extracted);
  assert.equal(result.value.premium, 95000);
  assert.deepEqual(result.fields.premium, {
    value: 95000, source: "Intake form", confidence: 1,
    candidates: [{ source: gemini, value: 90000, quote: "The premium is $90,000." }, { source: "Parser", value: 85000, quote: "Premium: $85,000" }],
  });
  const agreed = resolveCaseAppetite("Premium: $95,000", { premium: 95000 }, "", { premium: read(95000, "Parser", "Premium: $95,000") });
  assert.equal("candidates" in agreed.fields.premium!, false, "agreement is not a disagreement");
});

test("a reply line that the readers agree with carries the readers' provenance; one they dispute keeps the line", () => {
  const replies = "Premium: $105,000";
  const agreed = resolveCaseAppetite("Premium: $85,000", { premium: 95000 }, replies, { premium: read(105000, gemini, "Premium: $105,000", { confidence: 0.9 }) });
  assert.deepEqual(agreed.fields.premium, { value: 105000, source: `Broker text via ${gemini}`, confidence: 0.9, quote: "Premium: $105,000" });
  const disputed = resolveCaseAppetite("Premium: $85,000", { premium: 95000 }, replies, { premium: read(85000, gemini, "Premium: $85,000", { candidates: [{ source: gemini, value: 85000, quote: "Premium: $85,000" }, { source: "Parser", value: 105000, quote: "Premium: $105,000" }] }) });
  assert.equal(disputed.value.premium, 105000);
  assert.deepEqual(disputed.fields.premium, {
    value: 105000, source: "Broker reply line", confidence: 0.6, quote: "Premium: $105,000",
    candidates: [{ source: gemini, value: 85000, quote: "Premium: $85,000" }, { source: "Parser", value: 105000, quote: "Premium: $105,000" }],
  });
});

test("null extraction results never disturb the schema defaults", () => {
  const nothing: ExtractedAppetite = { lossHistoryComplete: read(null), premium: read(null), effective: read(null) };
  const result = resolveCaseAppetite("", null, "", nothing);
  assert.deepEqual(result.value, caseAppetiteSchema.parse({}));
  assert.deepEqual(result.fields.lossHistoryComplete, { value: null, source: "Not provided", confidence: 0 });
  const stated = resolveCaseAppetite("The five-year loss history is complete.", null, "", { lossHistoryComplete: read(true, gemini, "The five-year loss history is complete.") });
  assert.equal(stated.value.lossHistoryComplete, true);
  assert.equal(stated.fields.lossHistoryComplete?.quote, "The five-year loss history is complete.");
});
