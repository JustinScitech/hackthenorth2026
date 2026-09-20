import assert from "node:assert/strict";
import test from "node:test";
import type { CaseRecord, Finding } from "../lib/types";
import { geminiModels } from "./providers";
import { appetiteGuideText, applyVerdicts, flaggable, normalizeForMatch, renderSources, scoringText, verifyCase, verifyFindings, type VerifierSources, type VerifierVerdict } from "./verifier";

const sources: VerifierSources = {
  brokerNotes: "Commercial property submission for Ridgeway Distribution LLC. Warehouse constructed in 1985. No losses in the past three years. Premium: $85,000.",
  intake: { "insured name": "Ridgeway Distribution LLC", state: "CO", "total insured value": "$75,000,000", "year built": null, "loss count": null },
  publicEvidence: "Property Record Card. Year Built: 1985. Construction: Masonry. FEMA Flood Zone: X.",
};

const findings: Finding[] = [
  { id: "state", label: "Primary risk state", result: "pass", detail: "Target OH/PA/MD/CO/CA/FL; also acceptable NC/SC/GA/VA/UT. Observed CO.", source: "Intake form" },
  { id: "tiv", label: "Total insured value", result: "pass", detail: "Up to $150M; target $50M-$100M. Observed $75,000,000.", source: "Intake form" },
  { id: "year", label: "Building age", result: "refer", detail: "Newer than 1990; target newer than 2010. Oldest supplied building: 1985.", source: "Broker text" },
  // The invented claim: the sources say 1985 and nothing about a 2019 roof.
  { id: "evidence_yearBuilt", label: "Public year built", result: "pass", detail: "The public record agrees with the submission: built in 1985 with a roof replaced in 2019.", source: "Public source: assessor.example.gov (unverified)" },
];
const brief = "Score 49/100: matches primary risk state, total insured value. Exceptions: building age. Recommendation: refer for appetite exceptions; an underwriter makes the final decision.";

const verdicts = (...items: Partial<VerifierVerdict>[]): VerifierVerdict[] => items.map((item) => ({ id: "", supported: true, reason: "", quote: "", ...item }));
const scripted = (payload: unknown) => async () => ({ text: typeof payload === "string" ? payload : JSON.stringify(payload) });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
/** The production order: the configured model first, then the waterfall. */
const models = geminiModels();

test("normalization ignores case, currency punctuation, and spacing", () => {
  assert.equal(normalizeForMatch("  Observed $75,000,000. "), "observed 75000000");
  assert.ok(normalizeForMatch("Total insured value: $75,000,000").includes(normalizeForMatch("75,000,000")));
});

test("rendered sources label every section and keep intake values readable", () => {
  const text = renderSources(sources);
  assert.match(text, /\[Broker notes\]\n.*Ridgeway/);
  assert.match(text, /\[Intake form\]\n[\s\S]*total insured value: \$75,000,000/);
  assert.match(text, /year built: not provided/);
  assert.match(text, /\[Public source excerpt\]\n.*Year Built: 1985/);
  assert.equal(renderSources({}), "");
});

test("guard: only an unsupported verdict whose quote is in the claim and absent from the sources is flaggable", () => {
  const corpus = renderSources(sources);
  const claim = findings[3].detail;
  assert.equal(flaggable({ id: "x", supported: false, reason: "no roof work in sources", quote: "roof replaced in 2019" }, claim, corpus), true);
  assert.equal(flaggable({ id: "x", supported: false, reason: "wrong", quote: "1985" }, claim, corpus), false, "a quote present in the sources cannot be flagged");
  assert.equal(flaggable({ id: "x", supported: false, reason: "wrong", quote: "built in 1975" }, claim, corpus), false, "a quote that is not in the claim cannot be flagged");
  assert.equal(flaggable({ id: "x", supported: false, reason: "wrong", quote: "" }, claim, corpus), false, "the model must show its work");
  assert.equal(flaggable({ id: "x", supported: true, reason: "", quote: "roof replaced in 2019" }, claim, corpus), false);
});

test("the carrier appetite guide makes rule thresholds sourced text while invented values stay flaggable", () => {
  const guide = appetiteGuideText();
  assert.match(guide, /Total insured value: Up to \$150M; target \$50M-\$100M\./);
  assert.match(guide, /Building age: Newer than 1990; target newer than 2010\./);
  assert.doesNotMatch(guide, /75,000,000|1985/);
  const corpus = renderSources({ ...sources, guide });
  assert.match(corpus, /\[Carrier appetite guide\]\nSubmission type:/);
  assert.equal(flaggable({ id: "tiv", supported: false, reason: "No $150M in sources", quote: "$150M" }, findings[1].detail, corpus), false);
  assert.equal(flaggable({ id: "year", supported: false, reason: "No 1990 in sources", quote: "1990" }, findings[2].detail, corpus), false);
  assert.equal(flaggable({ id: "tiv", supported: false, reason: "TIV differs", quote: "$80,000,000" }, "Up to $150M; target $50M-$100M. Observed $80,000,000.", corpus), true);
});

test("reviewer scoring is a source, so score notation in the brief is never an invented number", () => {
  const scoring = scoringText({ score: 39, rawScore: 79, recommendation: "Refer for appetite exceptions", baseScore: 49, adjustments: [{ label: "Flood zone", points: -10, detail: "", source: "" }] });
  assert.equal(scoring, "Score 39/100 (raw 79-point match score, capped at 39). Recommendation: refer for appetite exceptions.\nPublic property records: Flood zone -10; priority 49 → 39.");
  const corpus = renderSources({ ...sources, scoring });
  assert.match(corpus, /\[Reviewer scoring\]\nScore 39\/100/);
  const adjustedBrief = `${brief} Public property records: Flood zone -10; priority 49 → 39.`;
  assert.equal(flaggable({ id: "brief", supported: false, reason: "Score not in sources", quote: "39/100" }, adjustedBrief, corpus), false);
  assert.equal(flaggable({ id: "brief", supported: false, reason: "Points not in sources", quote: "Flood zone -10" }, adjustedBrief, corpus), false);
  assert.equal(flaggable({ id: "brief", supported: false, reason: "No flood losses", quote: "$2,000,000" }, `${adjustedBrief} The insured reported $2,000,000 in flood losses.`, corpus), true);
});

test("unsupported findings are downgraded to refer with a Verifier prefix; supported ones are untouched", async () => {
  const before = clone(findings);
  const result = await verifyFindings(findings, sources, {
    brief,
    generate: scripted({ verdicts: verdicts(
      { id: "state", quote: "CO" }, { id: "tiv", quote: "$75,000,000" }, { id: "year", quote: "1985" },
      { id: "evidence_yearBuilt", supported: false, reason: "The sources do not mention any roof replacement.", quote: "roof replaced in 2019" },
      { id: "brief", quote: "building age" },
    ) }),
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(result.flagged, ["evidence_yearBuilt"]);
  assert.deepEqual(result.overruled, []);
  const flagged = result.findings.find((finding) => finding.id === "evidence_yearBuilt")!;
  assert.equal(flagged.result, "refer");
  assert.match(flagged.detail, /^Verifier: "roof replaced in 2019" was not found in the sources \(The sources do not mention any roof replacement\); confirm before relying on this finding\. /);
  assert.ok(flagged.detail.endsWith(findings[3].detail), "the original detail is kept after the prefix");
  assert.deepEqual(result.findings.filter((finding) => finding.id !== "evidence_yearBuilt"), before.filter((finding) => finding.id !== "evidence_yearBuilt"));
  assert.deepEqual(findings, before, "the input findings are not mutated");
  assert.equal(result.brief, `${brief} Verifier: 1 finding could not be traced to the sources (public year built); confirm before deciding.`);
});

test("a flagged finding is announced in the brief, and a clean run leaves the brief alone", () => {
  const corpus = renderSources(sources);
  const clean = applyVerdicts(findings, brief, verdicts({ id: "state", quote: "CO" }, { id: "brief", quote: "building age" }), corpus);
  assert.equal(clean.brief, brief);
  const two = applyVerdicts([...findings, { id: "evidence_squareFeet", label: "Public building size", result: "pass", detail: "The public source lists 88,000 square feet.", source: "Public source" }], brief,
    verdicts({ id: "evidence_yearBuilt", supported: false, reason: "No roof work.", quote: "roof replaced in 2019" }, { id: "evidence_squareFeet", supported: false, reason: "Size not in the excerpt.", quote: "88,000" }), corpus);
  assert.deepEqual(two.flagged, ["evidence_yearBuilt", "evidence_squareFeet"]);
  assert.ok(two.brief.endsWith(" Verifier: 2 findings could not be traced to the sources (public year built, public building size); confirm before deciding."));
  assert.equal(applyVerdicts(findings, "", two.findings.length ? verdicts({ id: "evidence_yearBuilt", supported: false, reason: "", quote: "roof replaced in 2019" }) : [], corpus).brief, "", "no brief means nothing to append to");
});

test("the verifier never upgrades a refer to pass and keeps a flagged refer as refer", () => {
  const applied = applyVerdicts(findings, brief, verdicts({ id: "year", supported: true, quote: "1985" }, { id: "year", supported: false, quote: "1985" }), renderSources(sources));
  assert.equal(applied.findings.find((finding) => finding.id === "year")!.result, "refer");
  const withInvented = applyVerdicts([{ ...findings[2], detail: "Oldest supplied building: 1975." }], brief, verdicts({ id: "year", supported: false, reason: "The sources say 1985.", quote: "1975" }), renderSources(sources));
  assert.equal(withInvented.findings[0].result, "refer");
  assert.match(withInvented.findings[0].detail, /^Verifier: /);
  assert.deepEqual(withInvented.flagged, ["year"]);
});

test("a model verdict that contradicts the sources is overruled by the deterministic guard", () => {
  const applied = applyVerdicts(findings, brief, verdicts({ id: "tiv", supported: false, reason: "TIV not stated.", quote: "$75,000,000" }, { id: "state", supported: false, reason: "", quote: "" }), renderSources(sources));
  assert.deepEqual(applied.flagged, []);
  assert.deepEqual(applied.overruled.sort(), ["state", "tiv"]);
  assert.deepEqual(applied.findings, findings);
  assert.deepEqual(applied.unverified.sort(), ["brief", "evidence_yearBuilt", "year"]);
});

test("an unsupported brief gets one verifier sentence appended, and only when its quote is absent from the sources", () => {
  const corpus = renderSources(sources);
  const invented = `${brief} The insured reported $2,000,000 in flood losses.`;
  const applied = applyVerdicts(findings, invented, verdicts({ id: "brief", supported: false, reason: "No flood losses appear in the sources.", quote: "$2,000,000 in flood losses" }), corpus);
  assert.ok(applied.brief.startsWith(invented));
  assert.match(applied.brief, / Verifier: "\$2,000,000 in flood losses" could not be traced to the sources \(No flood losses appear in the sources\); confirm before deciding\.$/);
  assert.deepEqual(applied.flagged, ["brief"]);
  const kept = applyVerdicts(findings, brief, verdicts({ id: "brief", supported: false, reason: "Score is not in the sources.", quote: "CO" }), corpus);
  assert.equal(kept.brief, brief);
});

test("one JSON call covers every finding and the brief, and its claims carry each id and detail", async () => {
  const calls: { model: string; prompt: string; text: string }[] = [];
  await verifyFindings(findings, sources, { brief, generate: async (model, prompt, text) => { calls.push({ model, prompt, text }); return { text: JSON.stringify({ verdicts: [] }) }; } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, models[0]);
  for (const finding of findings) assert.ok(calls[0].text.includes(`[id=${finding.id}]`) && calls[0].text.includes(finding.detail), `claim ${finding.id} is in the request`);
  assert.ok(calls[0].text.includes("[id=brief]") && calls[0].text.includes(brief));
  assert.ok(calls[0].text.includes(renderSources(sources)));
  assert.match(calls[0].prompt, /Return only JSON/);
});

test("malformed JSON from every model fails the verifier without touching the findings", async () => {
  const called: string[] = [];
  const result = await verifyFindings(findings, sources, { brief, generate: async (model) => { called.push(model); return { text: "not json {" }; } });
  assert.equal(result.status, "failed");
  assert.deepEqual(called, models, "a malformed answer falls through the waterfall like a transient error");
  assert.deepEqual(result.findings, findings);
  assert.equal(result.brief, brief);
  assert.deepEqual(result.flagged, []);
  assert.match(result.reason ?? "", /Gemini/);
  const wrongShape = await verifyFindings(findings, sources, { generate: scripted({ verdicts: [{ id: 1, supported: "yes" }] }), models: [models[0]] });
  assert.equal(wrongShape.status, "failed");
  assert.deepEqual(wrongShape.findings, findings);
});

test("a hung model call times out and leaves the findings unchanged", async () => {
  const result = await verifyFindings(findings, sources, { brief, timeoutMs: 20, generate: () => new Promise(() => {}) });
  assert.equal(result.status, "failed");
  assert.match(result.reason ?? "", /timed out/);
  assert.deepEqual(result.findings, findings);
  assert.equal(result.brief, brief);
});

test("a transient failure falls through to the next model; a quota error stops the waterfall", async () => {
  const called: string[] = [];
  const result = await verifyFindings(findings, sources, { generate: async (model) => { called.push(model); if (model === models[0]) throw { status: 503 }; return { text: JSON.stringify({ verdicts: verdicts({ id: "evidence_yearBuilt", supported: false, reason: "No roof work.", quote: "roof replaced in 2019" }) }) }; } });
  assert.deepEqual(called, models.slice(0, 2));
  assert.equal(result.status, "completed");
  assert.equal(result.model, models[1]);
  assert.deepEqual(result.flagged, ["evidence_yearBuilt"]);
  const quota = await verifyFindings(findings, sources, { generate: async () => { throw { status: 429 }; } });
  assert.equal(quota.status, "failed");
  assert.equal(quota.attempts.length, 1);
});

test("nothing to check or no source text is skipped without a model call", async () => {
  let calls = 0;
  const generate = async () => { calls++; return { text: "{}" }; };
  assert.equal((await verifyFindings([], sources, { generate })).status, "skipped");
  assert.equal((await verifyFindings(findings, {}, { generate })).status, "skipped");
  assert.equal(calls, 0);
});

const caseRecord = {
  id: "case-1", insuredName: "Ridgeway Distribution LLC", state: "CO", tiv: 75_000_000, yearBuilt: null, losses: null,
  appetite: { business: "new", line: "property", premium: 85_000, constructionPercent: 75, lossValue: 12_000, lossHistoryComplete: true, effective: "2026-01-01", expiration: "2027-01-01" },
  sourceKey: "source-1", publicSourceUrl: "https://assessor.example.gov/parcel/1", address: null,
  publicEvidence: { url: "https://assessor.example.gov/parcel/1", title: "Property Record Card", excerpt: sources.publicEvidence! },
  propertyContext: null, extractionConflicts: [], status: "checking", facts: null, findings: null, brief: null, question: null, decision: null,
  reportDraft: null, reportDraftVersion: 0, error: null, analysisRevision: 2, createdAt: "", updatedAt: "",
} as unknown as CaseRecord;

function fakeDeps(overrides: Partial<Parameters<typeof verifyCase>[3]> = {}) {
  const audit: { type: string; detail: Record<string, unknown>; key?: string }[] = [];
  const deps: NonNullable<Parameters<typeof verifyCase>[3]> = {
    env: { GEMINI_API_KEY: "test-key" },
    loadBrokerTexts: async () => [sources.brokerNotes!],
    addAudit: async (_caseId, type, detail = {}, key) => { audit.push({ type, detail, key }); },
    generate: scripted({ verdicts: verdicts(
      { id: "state", quote: "CO" }, { id: "tiv", quote: "$75,000,000" }, { id: "year", quote: "1985" },
      { id: "evidence_yearBuilt", supported: false, reason: "The sources do not mention any roof replacement.", quote: "roof replaced in 2019" },
      { id: "brief", quote: "building age" },
    ) }),
    ...overrides,
  };
  return { deps, audit };
}

test("verifyCase without a Gemini key skips with an audit note and never loads sources", async () => {
  let loaded = false;
  const { deps, audit } = fakeDeps({ env: {}, loadBrokerTexts: async () => { loaded = true; return []; } });
  const result = { findings: clone(findings), brief };
  await verifyCase("case-1", caseRecord, result, deps);
  assert.deepEqual(result.findings, findings);
  assert.equal(loaded, false);
  assert.deepEqual(audit.map((event) => event.type), ["verifier_skipped"]);
  assert.match(String(audit[0].detail.reason), /not configured/);
  assert.equal(audit[0].key, "verifier-skipped:case-1:2");
});

test("verifyCase flags unsupported findings, records each flag, and summarises the run", async () => {
  const { deps, audit } = fakeDeps();
  const result = { findings: clone(findings), brief };
  await verifyCase("case-1", caseRecord, result, deps);
  assert.deepEqual(audit.map((event) => event.type), ["verifier_started", "verifier_flagged", "verifier_completed"]);
  assert.equal(audit[0].detail.claims, findings.length + 1);
  assert.deepEqual(audit[1].detail, { revision: 2, id: "evidence_yearBuilt", label: "Public year built", quote: "roof replaced in 2019", reason: "The sources do not mention any roof replacement.", previousResult: "pass" });
  assert.equal(audit[1].key, "verifier-flagged:case-1:2:evidence_yearBuilt");
  assert.equal(audit[2].detail.flagged, 1);
  assert.equal(audit[2].detail.supported, 4);
  assert.equal(audit[2].detail.model, models[0]);
  assert.equal(audit[2].detail.unverified, 0);
  assert.equal(result.findings.find((finding) => finding.id === "evidence_yearBuilt")!.result, "refer");
  assert.equal(result.brief, `${brief} Verifier: 1 finding could not be traced to the sources (public year built); confirm before deciding.`);
});

test("verifyCase treats a model failure or a source read error as a skip, never a thrown error", async () => {
  const failing = fakeDeps({ generate: async () => { throw { status: 401 }; } });
  const result = { findings: clone(findings), brief };
  await verifyCase("case-1", caseRecord, result, failing.deps);
  assert.deepEqual(result.findings, findings);
  assert.deepEqual(failing.audit.map((event) => event.type), ["verifier_started", "verifier_skipped"]);
  assert.match(String(failing.audit[1].detail.reason), /unavailable/);

  const broken = fakeDeps({ loadBrokerTexts: async () => { throw new Error("MongoDB is down"); } });
  await verifyCase("case-1", caseRecord, { findings: clone(findings), brief }, broken.deps);
  assert.deepEqual(broken.audit.map((event) => event.type), ["verifier_skipped"]);
  assert.ok(!String(broken.audit[0].detail.reason).includes("MongoDB is down"), "error text stays out of the audit trail");

  const auditless = fakeDeps({ addAudit: async () => { throw new Error("audit unavailable"); } });
  await assert.doesNotReject(verifyCase("case-1", caseRecord, { findings: clone(findings), brief }, auditless.deps));
});

test("verifyCase reads the intake form, broker replies, public evidence, and property records as sources", async () => {
  let request = "";
  const { deps } = fakeDeps({
    loadBrokerTexts: async () => ["Original submission text.", "Broker reply: the roof is original."],
    generate: async (_model, _prompt, text) => { request = text; return { text: JSON.stringify({ verdicts: [] }) }; },
  });
  const record = { ...caseRecord, propertyContext: { address: "1 Main St", geocoded: { matchedAddress: "1 Main St" }, geocodeUrl: "", gatheredAt: "", sources: [{ id: "flood", label: "Flood zone", status: "ok", url: "", summary: "FEMA zone X.", data: {}, ms: 1 }, { id: "wildfire", label: "Wildfire", status: "unavailable", url: "", summary: "Unavailable.", data: {}, ms: 1 }] } } as unknown as CaseRecord;
  await verifyCase("case-1", record, { findings: clone(findings), brief }, deps);
  assert.match(request, /Original submission text\.[\s\S]*BROKER UPDATE[\s\S]*Broker reply: the roof is original\./);
  assert.match(request, /total insured value: \$75,000,000/);
  assert.match(request, /premium: \$85,000/);
  assert.match(request, /eligible construction percent: 75%/);
  assert.match(request, /Year Built: 1985\. Construction: Masonry/);
  assert.match(request, /\[Public property records\]\nFlood zone: FEMA zone X\./);
  assert.match(request, /\[Carrier appetite guide\]\nSubmission type: New business is acceptable/);
  assert.doesNotMatch(request, /Unavailable\./);
});
