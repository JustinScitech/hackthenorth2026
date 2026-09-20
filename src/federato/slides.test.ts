import assert from "node:assert/strict";
import test from "node:test";
import { buildTriageSlides, createTriageDeck } from "./slides";
import type { TriageReport } from "./triage";

function fixture(): Omit<TriageReport, "schema"> {
  const record = {
    id: "1", account: "Example property", score: 49, rawScore: 83,
    lifecycleStatus: "bound", evidenceNote: "Five-year loss completeness is unverified.",
    recommendation: "Refer", explanation: "Underwriter review required.", missingData: [],
    criteria: [{ concept: "lossValue" as const, factor: "Five-year loss value", status: "outside" as const, points: 0, maximum: 15, detail: "Observed losses exceed appetite.", source: "Policy.losses" }],
  };
  return {
    resource: "Submission", generatedAt: "2026-09-19T12:00:00.000Z", guidelineVersion: "2025 sample appetite",
    total: 3, evaluated: 2, truncated: true, enrichmentComplete: false, top: 1,
    mapping: {}, reasoning: ["Read actual submissions"], trace: [],
    ranked: [record, { ...record, id: "2", account: "Second property" }], topSubmissions: [record],
  };
}

test("slides retain scope, scores, exceptions, sources and partial-data caveats", () => {
  const pages = buildTriageSlides(fixture());
  const text = pages.flatMap((page) => [page.title, ...page.lines]).join(" ");
  for (const expected of ["actual submissions", "PARTIAL QUEUE", "PARTIAL POLICY LOOKUP", "Match score: 83/100", "Priority score: 49/100", "outside appetite", "unverified", "does not approve"]) assert.ok(text.includes(expected), expected);
  assert.ok(!text.includes("Policy.losses"));
  assert.ok(pages.some((page) => page.notes.includes("Policy.losses")));
  assert.ok(!text.includes("Second property"));
  assert.ok(buildTriageSlides(fixture(), true).some((page) => page.title.includes("Second property")));
});

test("long evidence continues on additional slides without losing its tail", () => {
  const report = fixture();
  report.topSubmissions[0].criteria[0].detail = "Supporting evidence. ".repeat(250) + "Final evidence detail.";
  const slides = buildTriageSlides(report);
  assert.ok(slides.some((slide) => slide.title.includes("continued")));
  assert.ok(slides.every((slide) => slide.lines.length <= 13));
  assert.ok(slides.every((slide) => slide.blocks.every((block) => block.lines.every((line) => line.length <= 76))));
  assert.ok(slides.flatMap((slide) => slide.lines).join(" ").includes("Final evidence detail."));
});

test("empty policy queues export with accurate labels", () => {
  const report = { ...fixture(), resource: "Policy", ranked: [], topSubmissions: [], total: 0, evaluated: 0, truncated: false, enrichmentComplete: true };
  const text = buildTriageSlides(report).flatMap((slide) => [slide.title, ...slide.lines]).join(" ");
  assert.ok(text.includes("Policy records"));
  assert.ok(text.includes("No ranked records"));
  assert.ok(!text.includes("actual submissions"));
});

test("deck serializes as a PowerPoint ZIP package", async () => {
  const output = await createTriageDeck(fixture()).write({ outputType: "nodebuffer" });
  assert.ok(Buffer.isBuffer(output));
  assert.equal(output.subarray(0, 2).toString(), "PK");
  assert.ok(output.includes(Buffer.from("ppt/presentation.xml")));
});

test("evidence blocks stay together and leave space above the footer", () => {
  const report = fixture();
  report.topSubmissions[0].criteria = Array.from({ length: 8 }, (_, index) => ({
    ...report.topSubmissions[0].criteria[0],
    factor: `Factor ${index + 1}`,
    detail: "A guideline needs review. ".repeat(8),
    source: "__policy.exposure_units.location.buildings.construction_type",
  }));
  for (const page of buildTriageSlides(report)) {
    let bottom = 1.95;
    for (const block of page.blocks) bottom += (block.label ? 0.64 : 0) + block.lines.length * 0.31 + 0.1 + 0.28;
    assert.ok(bottom < 6.65, `${page.title} overlaps the source note`);
    assert.ok(!page.lines.join(" ").includes("__policy"));
    if (page.subtitle) {
      assert.ok(page.blocks.every((block) => block.label?.startsWith("Factor")));
      assert.ok(page.notes.includes("__policy.exposure_units"));
    }
  }
});

test("record slides say what would change the outcome when the scorer found a gap", () => {
  const report = fixture();
  const condition = "Had five-year losses been under $100,000, it would score 83 and pass.";
  report.topSubmissions[0].counterfactuals = [{ concept: "lossValue", factor: "Five-year loss value", status: "outside", currentValue: 250_000, requiredValue: 99_999, projectedScore: 83, projectedAction: "Review for acceptance", patch: { lossValue: 99_999 }, condition, sentence: `This is outside appetite at 49/100. ${condition}` }];
  const text = buildTriageSlides(report).flatMap((page) => [page.title, ...page.lines]).join(" ");
  assert.ok(text.includes(`What would change it: ${condition}`), text);
  const plain = buildTriageSlides({ ...fixture(), topSubmissions: [{ ...fixture().topSubmissions[0], counterfactuals: [] }] }).flatMap((page) => page.lines).join(" ");
  assert.ok(!plain.includes("What would change it"));
});
