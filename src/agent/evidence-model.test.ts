import assert from "node:assert/strict";
import test from "node:test";
import { extractEvidenceSignals } from "./enrichment";
import { extractEvidence, mergeEvidenceSignals, parseModelSignals } from "./evidence-model";
import type { EvidenceSignal } from "../lib/types";

const page = `Property Record Card — 125 Wellington Road, Newark NJ 07105.
Year Built: 1965. Effective Year: 1988. Construction: Masonry. Stories: 1.
Building Sq Ft: 42,000. Use Code: 4300 Warehouse / Distribution.
Roof: Built-up, replaced 2019. Fire Protection: Sprinklered: Yes.`;

const kinds = (signals: EvidenceSignal[]) => signals.map((signal) => signal.kind);

test("model signals are kept only when the quote is verbatim page text", () => {
  const raw = JSON.stringify({ signals: [
    { kind: "yearBuilt", value: 1965, quote: "Year Built: 1965." },
    { kind: "floodZone", value: "AE", quote: "FEMA Flood Zone: AE" },
    { kind: "occupancy", value: "Warehouse / Distribution", quote: "Use   Code: 4300 Warehouse / Distribution." },
  ] });
  const parsed = parseModelSignals(raw, page);
  assert.deepEqual(kinds(parsed.signals), ["yearBuilt", "occupancy"]);
  assert.equal(parsed.dropped, 1);
});

test("model values are normalised per kind and impossible values are dropped", () => {
  const raw = JSON.stringify({ signals: [
    { kind: "yearBuilt", value: "1965", quote: "Year Built: 1965." },
    { kind: "squareFeet", value: "42,000", quote: "Building Sq Ft: 42,000." },
    { kind: "sprinklered", value: "yes", quote: "Sprinklered: Yes." },
    { kind: "constructionType", value: "  Masonry ", quote: "Construction: Masonry." },
    { kind: "yearBuilt", value: 1900, quote: "Year Built: 1965." },
    { kind: "floodZone", value: "Q9", quote: "Newark NJ 07105." },
    { kind: "roof", value: "Built-up", quote: "Roof: Built-up" },
    { kind: "occupancy", value: "", quote: "Use Code: 4300" },
  ] });
  const parsed = parseModelSignals(raw, page);
  assert.deepEqual(parsed.signals, [
    { kind: "yearBuilt", value: 1965, quote: "Year Built: 1965." },
    { kind: "squareFeet", value: 42_000, quote: "Building Sq Ft: 42,000." },
    { kind: "sprinklered", value: true, quote: "Sprinklered: Yes." },
    { kind: "constructionType", value: "Masonry", quote: "Construction: Masonry." },
  ]);
});

test("malformed, fenced, or empty model output yields no signals rather than an error", () => {
  for (const raw of [undefined, "", "not json {", '{"signals": "nope"}', '[{"kind":"yearBuilt","value":1965,"quote":"Year Built: 1965."}]']) {
    assert.deepEqual(parseModelSignals(raw, page), { signals: [], dropped: 0, malformed: true }, String(raw));
  }
  assert.deepEqual(parseModelSignals('{"signals": []}', page), { signals: [], dropped: 0, malformed: false });
  const fenced = "```json\n{\"signals\":[{\"kind\":\"yearBuilt\",\"value\":1965,\"quote\":\"Year Built: 1965.\"}]}\n```";
  assert.equal(parseModelSignals(fenced, page).signals[0]?.value, 1965);
});

test("merging keeps the parser as the floor, adds model-only signals, and reports disagreement as a conflict", () => {
  const parser = extractEvidenceSignals(page);
  const model: EvidenceSignal[] = [
    { kind: "yearBuilt", value: 1988, quote: "Effective Year: 1988." },
    { kind: "constructionType", value: "masonry", quote: "Construction: Masonry." },
    { kind: "floodZone", value: "X", quote: "Newark NJ 07105." },
  ];
  const merged = mergeEvidenceSignals(parser, model);
  const year = merged.signals.find((signal) => signal.kind === "yearBuilt");
  assert.equal(year?.value, 1965, "the parser value stays when the model disagrees");
  assert.equal(year?.agreement, "parser");
  assert.equal(merged.signals.find((signal) => signal.kind === "constructionType")?.agreement, "both");
  assert.equal(merged.signals.find((signal) => signal.kind === "floodZone")?.agreement, "model");
  assert.deepEqual(merged.conflicts, ["Year built differs: Parser 1965, Gemini 1988."]);
  for (const signal of parser) assert.ok(merged.signals.some((item) => item.kind === signal.kind && item.value === signal.value), `${signal.kind} must survive the merge`);
});

test("merging with no model output is the parser output", () => {
  const parser = extractEvidenceSignals(page);
  const merged = mergeEvidenceSignals(parser, []);
  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(merged.signals.map(({ kind, value, quote }) => ({ kind, value, quote })), parser);
  assert.ok(merged.signals.every((signal) => signal.agreement === "parser"));
});

test("evidence extraction without a Gemini key is the deterministic parser result", async () => {
  const key = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const result = await extractEvidence(page);
    assert.equal(result.model.status, "not_configured");
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(result.signals.map(({ kind, value, quote }) => ({ kind, value, quote })), extractEvidenceSignals(page));
  } finally {
    if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key;
  }
});

test("a model failure, timeout, or malformed reply never loses the parser signals", async () => {
  const parser = extractEvidenceSignals(page);
  for (const generate of [
    async () => { throw Object.assign(new Error("timeout"), { status: 408 }); },
    async () => { throw new Error("network down"); },
    async () => ({ text: "{ this is not json" }),
    async () => ({ text: undefined }),
  ]) {
    const result = await extractEvidence(page, generate);
    assert.equal(result.model.status, "failed");
    assert.deepEqual(result.signals.map(({ kind, value }) => ({ kind, value })), parser.map(({ kind, value }) => ({ kind, value })));
  }
});

test("a completed model pass merges with the parser and records what was dropped", async () => {
  const calls: string[] = [];
  const result = await extractEvidence(page, async (model, prompt, text) => {
    calls.push(model);
    assert.match(prompt, /quote/i);
    assert.ok(text.includes("Year Built: 1965"));
    return { text: JSON.stringify({ signals: [
      { kind: "yearBuilt", value: 1965, quote: "Year Built: 1965." },
      { kind: "floodZone", value: "AE", quote: "invented sentence" },
      { kind: "occupancy", value: "Warehouse / Distribution", quote: "Use Code: 4300 Warehouse / Distribution." },
    ] }), modelVersion: "gemini-test" };
  });
  assert.equal(calls.length, 1);
  assert.equal(result.model.status, "completed");
  assert.equal(result.model.model, "gemini-test");
  assert.equal(result.model.dropped, 1);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.signals.find((signal) => signal.kind === "yearBuilt")?.agreement, "both");
  assert.ok(!result.signals.some((signal) => signal.kind === "floodZone"), "an unquoted signal must not appear");
});
