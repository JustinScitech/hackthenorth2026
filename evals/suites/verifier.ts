import { BROKER_UPDATE_SEPARATOR, buildFacts, evaluateFacts, parseBrokerNotes, type Intake } from "../../src/agent/analysis";
import { appetiteGuideText, applyVerdicts, renderSources, scoringText, verifyCase, verifyFindings, type VerifierSources, type VerifierVerdict } from "../../src/agent/verifier";
import { mergeCaseAppetite } from "../../src/lib/case-appetite";
import type { CaseRecord, Finding } from "../../src/lib/types";
import { judgeEnabled } from "../judge";
import { attemptAsync, same, sleep, type CaseResult, type Suite } from "../runner";

/**
 * The verifier is the last reader before an underwriter: it checks every
 * finding and the brief against the source text and may only make the review
 * more cautious. These cases feed findings whose values are not in any source
 * and assert they come back as referrals with a "Verifier" prefix, while
 * supported findings, refer results, and the model's own mistakes are left
 * exactly where the deterministic guard says they belong. The model is
 * scripted so the suite is offline; with EVAL_JUDGE=gemini the same fixtures
 * also run through the live model and the hit rate lands in the metrics.
 */
const appetiteLines = "Business type: new\nLine of business: property\nPremium: $85,000\nEligible construction percent: 75%\nEffective date: 2026-01-01\nExpiration date: 2027-01-01\nFive-year loss value: $12,000\nFive-year history complete: yes";
const submission = `Commercial property submission for Ridgeway Distribution LLC.\n${appetiteLines}\nWarehouse constructed in 1985. No losses in the past three years.`;
const intake: Intake = { insuredName: "Ridgeway Distribution LLC", state: "CO", tiv: 75_000_000, yearBuilt: null, losses: null };
const publicEvidence = "Property Record Card. Year Built: 1985. Construction: Masonry. Building Sq Ft: 42,000. FEMA Flood Zone: X.";

/** Mirrors extractCase + checkCase for one text, then optionally replaces the extracted facts with what a hallucinating model might return. */
function analyze(texts: string[], extracted = parseBrokerNotes(texts.join(BROKER_UPDATE_SEPARATOR))) {
  const appetite = mergeCaseAppetite(texts[0], undefined, texts.slice(1).join("\n"));
  const facts = buildFacts({ ...intake, appetite }, extracted);
  return evaluateFacts(facts);
}

const sources = (overrides: Partial<VerifierSources> = {}): VerifierSources => ({
  brokerNotes: submission,
  intake: { "insured name": intake.insuredName, state: intake.state, "total insured value": "$75,000,000", "year built": null, "three-year loss count": null, premium: "$85,000", "eligible construction percent": "75%", "five-year loss value": "$12,000" },
  publicEvidence,
  guide: appetiteGuideText(),
  ...overrides,
});

const verdict = (id: string, supported: boolean, quote: string, reason = supported ? "" : `The sources do not state ${quote}.`): VerifierVerdict => ({ id, supported, reason, quote });
const scripted = (verdicts: VerifierVerdict[]) => async () => ({ text: JSON.stringify({ verdicts }) });
const byId = (findings: Finding[], id: string) => findings.find((finding) => finding.id === id);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

type Case = {
  name: string;
  findings: () => Finding[];
  brief?: string;
  /** The scripted model's answer; `expectFlagged` names the claims the guard must let through. */
  verdicts: (findings: Finding[]) => VerifierVerdict[];
  expectFlagged: string[];
  sources?: VerifierSources;
  check?: (before: Finding[], after: Finding[], brief: string) => string[];
  note?: string;
  /** Whether the live model should reproduce the flags; only measured with EVAL_JUDGE=gemini. */
  live?: boolean;
};

const supportedVerdicts = (findings: Finding[], except: Record<string, VerifierVerdict> = {}) =>
  findings.map((finding) => except[finding.id] ?? verdict(finding.id, true, finding.detail.match(/Observed ([^.]+)/)?.[1] ?? finding.label));

export const verifierCases: Case[] = [
  {
    name: "hallucinated construction year is flagged and referred",
    findings: () => analyze([submission], { yearBuilt: 2005, losses: 0 }).findings,
    verdicts: (findings) => supportedVerdicts(findings, { year: verdict("year", false, "2005", "The broker note says the warehouse was constructed in 1985, not 2005.") }),
    expectFlagged: ["year"],
    check: (before, after) => [
      byId(before, "year")?.result === "pass" ? "" : `fixture should start as pass, got ${byId(before, "year")?.result}`,
      byId(after, "year")?.result === "refer" ? "" : `year result ${byId(after, "year")?.result}`,
      byId(after, "year")?.detail.startsWith('Verifier: "2005" was not found in the sources (The broker note says') ? "" : `detail ${byId(after, "year")?.detail}`,
      byId(after, "year")?.detail.endsWith(byId(before, "year")!.detail) ? "" : "original detail must be kept",
    ].filter(Boolean),
    note: "A model that invents a post-1990 year would turn a pre-1990 exception into a pass; the verifier must catch it.",
    live: true,
  },
  {
    name: "loss dollars mistaken for a claim count are flagged",
    findings: () => [...analyze([submission]).findings, { id: "extraction_conflict_0", label: "Extraction conflict", result: "pass", detail: "Recent loss count: 120 claims in the past three years.", source: "Independent extraction" }],
    verdicts: (findings) => supportedVerdicts(findings, { extraction_conflict_0: verdict("extraction_conflict_0", false, "120 claims", "The note says no losses in the past three years.") }),
    expectFlagged: ["extraction_conflict_0"],
    note: "$120,000 in paid losses read as 120 claims is the classic unit confusion.",
    live: true,
  },
  {
    name: "invented public-record detail is flagged while the corroborated year passes",
    findings: () => [...analyze([submission]).findings, { id: "evidence_yearBuilt", label: "Public year built", result: "pass", detail: "The public record agrees with the submission: built in 1985 with a roof replaced in 2019.", source: "Public source: assessor.example.gov (unverified)" }],
    verdicts: (findings) => supportedVerdicts(findings, { evidence_yearBuilt: verdict("evidence_yearBuilt", false, "roof replaced in 2019", "No roof work appears in the sources.") }),
    expectFlagged: ["evidence_yearBuilt"],
    live: true,
  },
  {
    name: "supported findings are untouched byte for byte",
    findings: () => analyze([submission]).findings,
    verdicts: (findings) => supportedVerdicts(findings),
    expectFlagged: [],
    check: (before, after) => [same(before, after) ? "" : "findings changed without a flag"].filter(Boolean),
    live: true,
  },
  {
    name: "a refer is never upgraded to pass, whatever the model says",
    findings: () => analyze([submission]).findings,
    verdicts: (findings) => supportedVerdicts(findings, { year: verdict("year", true, "constructed in 1985") }),
    expectFlagged: [],
    check: (before, after) => [byId(before, "year")?.result === "refer" && byId(after, "year")?.result === "refer" ? "" : `year ${byId(before, "year")?.result} -> ${byId(after, "year")?.result}`].filter(Boolean),
    note: "Supported only means untouched; the 1985 exception stays a referral.",
  },
  {
    name: "a flagged refer stays refer and gains the prefix",
    findings: () => analyze([submission], { yearBuilt: 1975, losses: 0 }).findings,
    verdicts: (findings) => supportedVerdicts(findings, { year: verdict("year", false, "1975", "The note says 1985.") }),
    expectFlagged: ["year"],
    check: (_before, after) => [byId(after, "year")?.result === "refer" && byId(after, "year")!.detail.startsWith("Verifier: ") ? "" : "refer must keep refer and gain the prefix"].filter(Boolean),
  },
  {
    name: "guard overrules an objection whose quote is in the sources",
    findings: () => analyze([submission]).findings,
    verdicts: (findings) => supportedVerdicts(findings, { tiv: verdict("tiv", false, "$75,000,000", "TIV is not stated in the broker note."), year: verdict("year", false, "1985", "Year not found.") }),
    expectFlagged: [],
    check: (before, after) => [same(before, after) ? "" : "guard let a sourced value be flagged"].filter(Boolean),
    note: "The intake form states the TIV and the note states 1985; the model's word alone never changes a finding.",
  },
  {
    name: "guard overrules an objection whose quote is not in the claim",
    findings: () => analyze([submission]).findings,
    verdicts: (findings) => supportedVerdicts(findings, { premium: verdict("premium", false, "$95,000", "Premium differs.") }),
    expectFlagged: [],
    check: (before, after) => [same(before, after) ? "" : "guard let a phantom quote be flagged"].filter(Boolean),
  },
  {
    name: "guard overrules an objection with no quote",
    findings: () => analyze([submission]).findings,
    verdicts: (findings) => supportedVerdicts(findings, { state: verdict("state", false, "", "Unsure.") }),
    expectFlagged: [],
    check: (before, after) => [same(before, after) ? "" : "guard let an unquoted objection be flagged"].filter(Boolean),
  },
  {
    name: "rule thresholds quoted from the carrier guide are not flaggable",
    findings: () => analyze([submission]).findings,
    verdicts: (findings) => supportedVerdicts(findings, { tiv: verdict("tiv", false, "$150M", "No $150M in the sources."), premium: verdict("premium", false, "$50K-$175K", "Range not in sources.") }),
    expectFlagged: [],
    check: (before, after) => [same(before, after) ? "" : "guide thresholds were flagged"].filter(Boolean),
    note: "Every appetite finding embeds its rule text; treating a threshold as an invented number would refer every clean case.",
  },
  {
    name: "unsupported brief statement gets one verifier sentence",
    findings: () => analyze([submission]).findings,
    brief: `${analyze([submission]).brief} The insured reported $2,000,000 in flood losses.`,
    verdicts: (findings) => [...supportedVerdicts(findings), verdict("brief", false, "$2,000,000 in flood losses", "No flood losses appear in the sources.")],
    expectFlagged: ["brief"],
    check: (_before, _after, brief) => [/ Verifier: "\$2,000,000 in flood losses" could not be traced to the sources \(No flood losses appear in the sources\); confirm before deciding\.$/.test(brief) ? "" : `brief ${brief}`].filter(Boolean),
    live: true,
  },
  {
    name: "a brief objection about the score is overruled",
    findings: () => analyze([submission]).findings,
    brief: analyze([submission]).brief,
    sources: sources({ scoring: scoringText(analyze([submission]).appetiteResult) }),
    verdicts: (findings) => [...supportedVerdicts(findings), verdict("brief", false, "49/100", "The score is not in the sources."), verdict("brief", false, "79-point", "Raw score is not in the sources.")],
    expectFlagged: [],
    check: (_before, _after, brief) => [brief === analyze([submission]).brief ? "" : "score objection changed the brief"].filter(Boolean),
    note: "The score is the reviewer's own arithmetic, listed under [Reviewer scoring] in the sources, so the guard treats '49/100' as sourced text; without that section a determined objection would land.",
  },
  {
    name: "broker reply that corrects the year makes the earlier year unsupported",
    findings: () => analyze([submission, "Correction: the warehouse was constructed in 1995, not 1985."], { yearBuilt: 1985, losses: 0 }).findings,
    sources: sources({ brokerNotes: `${submission}${BROKER_UPDATE_SEPARATOR}Correction: the warehouse was constructed in 1995, not 1985.` }),
    verdicts: (findings) => supportedVerdicts(findings, { year: verdict("year", false, "1985", "The broker corrected the year to 1995.") }),
    expectFlagged: [],
    check: (before, after) => [same(before, after) ? "" : "1985 is still in the joined text, so it is sourced"].filter(Boolean),
    note: "Presence, not truth: the verifier checks that a value exists in the sources. Supersession is the extractor's job; the verifier must not second-guess it.",
  },
];

/** Behaviours of the model-call path itself: malformed answers, hangs, and a missing key. */
async function robustnessCases(): Promise<CaseResult[]> {
  const findings = analyze([submission]).findings;
  const brief = analyze([submission]).brief;
  const results: CaseResult[] = [];
  results.push(await attemptAsync("malformed JSON leaves the findings untouched and reports a failure", async () => {
    const result = await verifyFindings(findings, sources(), { brief, generate: async () => ({ text: "Sure! Here are the verdicts: [" }) });
    return [result.status === "failed" ? "" : `status ${result.status}`, same(result.findings, findings) && result.brief === brief ? "" : "findings or brief changed", result.attempts.length >= 1 && result.attempts.every((attempt) => attempt.status === "failed") ? "" : "every attempt should be a failure"].filter(Boolean);
  }, "A parser that half-applies a broken answer would be worse than no verifier."));
  results.push(await attemptAsync("a hung model times out without touching the findings", async () => {
    const result = await verifyFindings(findings, sources(), { brief, timeoutMs: 25, generate: () => new Promise(() => {}) });
    return [result.status === "failed" && /timed out/.test(result.reason ?? "") ? "" : `status ${result.status} ${result.reason}`, same(result.findings, findings) ? "" : "findings changed"].filter(Boolean);
  }));
  results.push(await attemptAsync("without a Gemini key the case is skipped with an audit note", async () => {
    const audit: string[] = [];
    const result = { findings: clone(findings), brief };
    const record = { id: "case", analysisRevision: 1, insuredName: intake.insuredName, state: "CO", tiv: intake.tiv, yearBuilt: null, losses: null, sourceKey: "s", publicSourceUrl: null, address: null, publicEvidence: null, propertyContext: null, extractionConflicts: [] } as unknown as CaseRecord;
    await verifyCase("case", record, result, { env: {}, loadBrokerTexts: async () => [submission], addAudit: async (_id, type) => { audit.push(type); } });
    return [same(audit, ["verifier_skipped"]) ? "" : `audit ${audit.join(",")}`, same(result.findings, findings) ? "" : "findings changed"].filter(Boolean);
  }));
  results.push(await attemptAsync("a model failure inside verifyCase is a skip, not a thrown error", async () => {
    const audit: string[] = [];
    const record = { id: "case", analysisRevision: 1, insuredName: intake.insuredName, state: "CO", tiv: intake.tiv, yearBuilt: null, losses: null, sourceKey: "s", publicSourceUrl: null, address: null, publicEvidence: null, propertyContext: null, extractionConflicts: [] } as unknown as CaseRecord;
    await verifyCase("case", record, { findings: clone(findings), brief }, { env: { GEMINI_API_KEY: "k" }, loadBrokerTexts: async () => [submission], addAudit: async (_id, type) => { audit.push(type); }, generate: async () => { throw { status: 500 }; } });
    return [same(audit, ["verifier_started", "verifier_skipped"]) ? "" : `audit ${audit.join(",")}`].filter(Boolean);
  }));
  return results;
}

export const verifierSuite: Suite = {
  name: "verifier",
  description: "Source verifier: unsupported findings become referrals, supported ones are untouched, and the guard overrules the model",
  async run(options) {
    const results: CaseResult[] = [];
    for (const item of verifierCases) {
      const before = item.findings();
      const brief = item.brief ?? "";
      const corpus = renderSources(item.sources ?? sources());
      results.push(await attemptAsync(item.name, async () => {
        const result = await verifyFindings(before, item.sources ?? sources(), { brief, generate: scripted(item.verdicts(before)) });
        const problems = [
          result.status === "completed" ? "" : `status ${result.status}: ${result.reason}`,
          same([...result.flagged].sort(), [...item.expectFlagged].sort()) ? "" : `flagged ${JSON.stringify(result.flagged)}, expected ${JSON.stringify(item.expectFlagged)}`,
          result.findings.every((finding, index) => finding.result !== "pass" || before[index].result === "pass") ? "" : "a result was upgraded",
          result.findings.every((finding, index) => !(before[index].result === "refer" && finding.result !== "refer")) ? "" : "a refer was changed",
          ...(item.check?.(before, result.findings, result.brief) ?? []),
        ];
        // The pure application step must agree with the full call.
        const direct = applyVerdicts(before, brief, item.verdicts(before), corpus);
        if (!same(direct.findings, result.findings) || direct.brief !== result.brief) problems.push("applyVerdicts and verifyFindings disagree");
        return problems.filter(Boolean);
      }, item.note));
    }
    results.push(...await robustnessCases());

    if (judgeEnabled()) {
      // Informational: does the live model reproduce the scripted flags? Recorded as metrics, never as pass/fail.
      let index = 0;
      for (const item of verifierCases.filter((entry) => entry.live)) {
        if (index++ > 0) await sleep(options.modelDelayMs);
        const before = item.findings();
        const result = await verifyFindings(before, item.sources ?? sources(), { brief: item.brief ?? "" });
        const expected = new Set(item.expectFlagged);
        const hit = result.flagged.filter((id) => expected.has(id)).length;
        const metrics = { live_runs: 1, live_unavailable: result.status === "completed" ? 0 : 1, live_expected_flags: expected.size, live_hits: hit, live_misses: expected.size - hit, live_false_flags: result.flagged.filter((id) => !expected.has(id)).length, live_overruled: result.overruled.length };
        results.push({ name: `live: ${item.name}`, passed: true, metrics, detail: result.status === "completed" ? `flagged ${JSON.stringify(result.flagged)} via ${result.model}${result.overruled.length ? `, overruled ${JSON.stringify(result.overruled)}` : ""}` : result.reason });
        options.log?.(`LIVE verifier · ${item.name}: ${result.status} flagged ${JSON.stringify(result.flagged)} expected ${JSON.stringify(item.expectFlagged)}${result.overruled.length ? ` overruled ${JSON.stringify(result.overruled)}` : ""}`);
      }
    }
    return results;
  },
};
