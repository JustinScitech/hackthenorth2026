import { z } from "zod";
import { BROKER_UPDATE_SEPARATOR, buildFacts, evaluateFacts, parseBrokerNotes, type Intake } from "../../src/agent/analysis";
import { evidenceFindings } from "../../src/agent/enrichment";
import { appetiteGuideText, applyVerdicts, normalizeForMatch, renderSources, scoringText, type VerifierSources } from "../../src/agent/verifier";
import { mergeCaseAppetite } from "../../src/lib/case-appetite";
import type { Facts, Finding } from "../../src/lib/types";
import { judgeEnabled, judgeJson } from "../judge";
import { sleep, type CaseResult, type Suite } from "../runner";

/**
 * The brief is the paragraph an underwriter reads first. Each case builds one
 * through the same functions checkCase uses and grades it on a four-item
 * rubric: it cites sources (every factor it names is a finding with a recorded
 * source), it invents no numbers (every year, dollar amount, and percentage in
 * it appears in the sources or the reviewer's own scoring), it states the
 * recommendation, and it stays under MAX_BRIEF_SENTENCES sentences. The
 * deterministic floor decides pass or fail, so `npm run eval` needs no key.
 * With EVAL_JUDGE=gemini the same rubric is also scored by Gemini; both views
 * land in the scorecard metrics and the judge's disagreements in the detail.
 */
export const MAX_BRIEF_SENTENCES = 10;

export type Rubric = { citesSources: boolean; noInventedNumbers: boolean; statesRecommendation: boolean; underSentenceLimit: boolean };
const rubricItems = ["citesSources", "noInventedNumbers", "statesRecommendation", "underSentenceLimit"] as const;

/** Sentence boundaries: terminal punctuation followed by a capital, quote, or bracket. Decimal points and "$12,000." stay inside their sentence. */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z"(])/).map((item) => item.trim()).filter(Boolean);
}

/** Dollar amounts, four-digit years, and percentages: the numbers a brief could invent. Scores such as 49/100 are the reviewer's own notation and are covered by the scoring source. */
export function briefNumbers(text: string): string[] {
  return [...text.matchAll(/\$\d[\d,]*(?:\.\d+)?[KM]?|\b(?:18|19|20)\d{2}\b|\b\d+(?:\.\d+)?%/g)].map((match) => match[0]);
}

/** The factors a brief names in its "matches ..." and "Exceptions: ..." lists. */
export function namedFactors(brief: string): string[] {
  const names: string[] = [];
  const matches = brief.match(/\bmatches ([^.]+)\./);
  if (matches) names.push(...matches[1].split(","));
  const exceptions = brief.match(/\bExceptions: ([^.]+)\./);
  if (exceptions) names.push(...exceptions[1].split(","));
  return names.map((name) => name.trim()).filter(Boolean);
}

export function scoreBriefFloor(brief: string, findings: Finding[], corpus: string): Rubric {
  const labels = new Map(findings.map((finding) => [finding.label.toLowerCase(), finding]));
  const factors = namedFactors(brief);
  const traced = factors.every((name) => Boolean(labels.get(name.toLowerCase())?.source.trim()));
  const normalizedCorpus = normalizeForMatch(corpus);
  return {
    citesSources: traced && (factors.length > 0 || /no verified appetite matches/.test(brief)),
    noInventedNumbers: briefNumbers(brief).every((number) => normalizedCorpus.includes(normalizeForMatch(number))),
    statesRecommendation: /\bRecommendation: (refer|investigate|review)/i.test(brief),
    underSentenceLimit: sentences(brief).length <= MAX_BRIEF_SENTENCES,
  };
}

export const failedItems = (rubric: Rubric): (keyof Rubric)[] => rubricItems.filter((item) => !rubric[item]);

const JUDGE_PROMPT = [
  "You grade the brief of an automated underwriting review. You receive the SOURCES the reviewer had, the FINDINGS it produced (each with a source), and the BRIEF.",
  `Score the brief on four rubric items and return only JSON {"citesSources":boolean,"noInventedNumbers":boolean,"statesRecommendation":boolean,"underSentenceLimit":boolean,"notes":string}.`,
  "citesSources: every factor or fact the brief names can be traced to a finding with a recorded source, or the brief says plainly that nothing matched.",
  "noInventedNumbers: every year, dollar amount, percentage, or count in the brief appears in the sources; scores such as \"49/100\", \"79-point\", and point adjustments such as \"-10\" are the reviewer's own arithmetic listed under [Reviewer scoring] and do not count as invented.",
  "statesRecommendation: the brief states a recommendation (refer, investigate, or review for acceptance).",
  `underSentenceLimit: the brief has at most ${MAX_BRIEF_SENTENCES} sentences.`,
  "Keep notes under 40 words.",
].join(" ");
const judgeSchema = z.object({ citesSources: z.boolean(), noInventedNumbers: z.boolean(), statesRecommendation: z.boolean(), underSentenceLimit: z.boolean(), notes: z.string().default("") });

// --- Fixtures built the way checkCase builds a brief ---

const appetiteLines = "Business type: new\nLine of business: property\nPremium: $85,000\nEligible construction percent: 75%\nEffective date: 2026-01-01\nExpiration date: 2027-01-01";
const intake = (overrides: Partial<Omit<Intake, "appetite">> = {}): Omit<Intake, "appetite"> => ({ insuredName: "Ridgeway Distribution LLC", state: "CO", tiv: 75_000_000, yearBuilt: null, losses: null, ...overrides });
const evidence = { url: "https://assessor.example.gov/parcel/0421-00017", title: "Property Record Card", excerpt: "Property Record Card. Year Built: 1965. Construction: Masonry. FEMA Flood Zone: AE (Special Flood Hazard Area)." };

type Built = { brief: string; findings: Finding[]; sources: VerifierSources };
type Case = { name: string; build: () => Built; /** A negative control: the floor is expected to report exactly these items. */ expectFailing?: (keyof Rubric)[]; note?: string };

function analyze(item: Omit<Intake, "appetite">, texts: string[], extracted = parseBrokerNotes(texts.join(BROKER_UPDATE_SEPARATOR))) {
  const appetite = mergeCaseAppetite(texts[0], undefined, texts.slice(1).join("\n"));
  const facts = buildFacts({ ...item, appetite }, extracted);
  const result = evaluateFacts(facts);
  const sources: VerifierSources = {
    brokerNotes: texts.join(BROKER_UPDATE_SEPARATOR),
    intake: { "insured name": item.insuredName, state: item.state, "total insured value": item.tiv === null ? null : `$${item.tiv.toLocaleString("en-US")}`, "year built": item.yearBuilt, "three-year loss count": item.losses },
    guide: appetiteGuideText(),
    scoring: scoringText(result.appetiteResult),
  };
  return { facts, result, sources };
}

export const briefCases: Case[] = [
  {
    name: "clean submission: every match named, recommendation stated",
    build: () => { const { result, sources } = analyze(intake({ yearBuilt: 2015 }), [`${appetiteLines}\nFive-year loss value: $12,000\nFive-year history complete: yes\nWarehouse constructed in 2015. No losses in the past three years.`]); return { brief: result.brief, findings: result.findings, sources }; },
  },
  {
    name: "appetite exception: the exception is named and referred",
    build: () => { const { result, sources } = analyze(intake(), [`${appetiteLines}\nFive-year loss value: $12,000\nFive-year history complete: yes\nWarehouse constructed in 1985. No losses in the past three years.`]); return { brief: result.brief, findings: result.findings, sources }; },
    note: "The 1985 exception must be named so the underwriter sees why the score is capped.",
  },
  {
    name: "missing data: the brief asks to clarify and recommends investigation",
    build: () => { const { result, sources } = analyze(intake(), ["Business type: new\nLine of business: property\nWarehouse; details to follow."]); return { brief: result.brief, findings: result.findings, sources }; },
  },
  {
    name: "extraction conflict adds one verification sentence",
    build: () => {
      const { result, sources } = analyze(intake(), [`${appetiteLines}\nFive-year loss value: $12,000\nFive-year history complete: yes\nBuilt in 1998. Claims: 1.`]);
      // As checkCase does when extraction_conflicts is non-empty.
      return { brief: `${result.brief} Verify conflicting extraction results before deciding.`, findings: [...result.findings, { id: "extraction_conflict_0", label: "Extraction conflict", result: "refer", detail: "Year built differs: Parser 1998, Gemini gemini-3.8-flash 1989.", source: "Independent extraction" }], sources };
    },
  },
  {
    name: "public source contradiction adds one sentence and stays sourced",
    build: () => {
      const { facts, result, sources } = analyze(intake({ yearBuilt: 2005 }), [`${appetiteLines}\nFive-year loss value: $12,000\nFive-year history complete: yes\nOffice built in 2005. No losses.`]);
      const found = evidenceFindings(facts as Facts, evidence, [{ kind: "yearBuilt", value: 1965, quote: "Year Built: 1965." }, { kind: "floodZone", value: "AE", quote: "FEMA Flood Zone: AE" }]);
      return { brief: `${result.brief} The public source raises a point to verify before deciding.`, findings: [...result.findings, ...found], sources: { ...sources, publicEvidence: evidence.excerpt } };
    },
  },
  {
    name: "longest brief: cap, conflict, public source, property records, and both verifier notes stay under the limit",
    build: () => {
      const { facts, result, sources } = analyze(intake(), [`${appetiteLines}\nFive-year loss value: $12,000\nFive-year history complete: yes\nWarehouse constructed in 1985. No losses in the past three years.`]);
      // Every sentence checkCase can append, each backed by the finding that produces it.
      const conflict: Finding = { id: "extraction_conflict_0", label: "Extraction conflict", result: "refer", detail: "Year built differs: Parser 1985, Gemini gemini-3.8-flash 1958.", source: "Independent extraction" };
      const publicFindings = evidenceFindings(facts as Facts, evidence, [{ kind: "floodZone", value: "AE", quote: "FEMA Flood Zone: AE" }, { kind: "squareFeet", value: 88_000, quote: "Building Sq Ft: 88,000" }]);
      const brief = `${result.brief} Verify conflicting extraction results before deciding. The public source raises a point to verify before deciding. Public property records move priority by -10 (flood zone -10). The insured confirmed the roof was recently replaced.`;
      const withRecords: VerifierSources = { ...sources, publicEvidence: evidence.excerpt, propertyRecords: ["Flood zone: FEMA zone AE, a Special Flood Hazard Area."], scoring: scoringText({ ...result.appetiteResult, baseScore: result.appetiteResult.score, score: result.appetiteResult.score - 10, adjustments: [{ label: "Flood zone", points: -10, detail: "", source: "" }] }) };
      const applied = applyVerdicts([...result.findings, conflict, ...publicFindings], brief, [
        { id: "evidence_squareFeet", supported: false, reason: "The excerpt lists no building size.", quote: "88,000" },
        { id: "brief", supported: false, reason: "No roof work appears in the sources.", quote: "roof was recently replaced" },
      ], renderSources(withRecords));
      if (applied.flagged.length !== 2) throw new Error(`fixture expected two flags, got ${JSON.stringify(applied.flagged)}`);
      return { brief: applied.brief, findings: applied.findings, sources: withRecords };
    },
    note: "The most the pipeline can say in one brief: four scoring sentences, conflict, public source, property records, a flagged finding, and a flagged brief statement.",
  },
  {
    name: "negative control: an invented dollar figure fails the numbers check",
    build: () => { const { result, sources } = analyze(intake({ yearBuilt: 2015 }), [`${appetiteLines}\nFive-year loss value: $12,000\nFive-year history complete: yes\nWarehouse constructed in 2015.`]); return { brief: `${result.brief} The insured reported $2,000,000 in flood losses in 2019.`, findings: result.findings, sources }; },
    expectFailing: ["noInventedNumbers"],
    note: "The floor has to catch what the verifier is for; a rubric that passes an invented figure measures nothing.",
  },
  {
    name: "negative control: a factor with no finding behind it fails the citation check",
    build: () => { const { result, sources } = analyze(intake({ yearBuilt: 2015 }), [`${appetiteLines}\nFive-year loss value: $12,000\nFive-year history complete: yes\nWarehouse constructed in 2015.`]); return { brief: result.brief.replace("matches ", "matches roof condition, "), findings: result.findings, sources }; },
    expectFailing: ["citesSources"],
  },
  {
    name: "negative control: a brief without a recommendation fails",
    build: () => { const { result, sources } = analyze(intake({ yearBuilt: 2015 }), [`${appetiteLines}\nFive-year loss value: $12,000\nFive-year history complete: yes\nWarehouse constructed in 2015.`]); return { brief: result.brief.replace(/Recommendation: [^;]+; /, ""), findings: result.findings, sources }; },
    expectFailing: ["statesRecommendation"],
  },
];

export const briefQualitySuite: Suite = {
  name: "brief-quality",
  description: "Brief rubric: cites sources, invents no numbers, states the recommendation, stays short; floor decides, Gemini judge recorded with EVAL_JUDGE=gemini",
  async run(options) {
    const results: CaseResult[] = [];
    const judge = judgeEnabled();
    for (const [index, item] of briefCases.entries()) {
      let built: Built;
      try { built = item.build(); } catch (error) { results.push({ name: item.name, passed: false, detail: `threw ${error instanceof Error ? error.message : String(error)}`, note: item.note }); continue; }
      const corpus = renderSources(built.sources);
      const floor = scoreBriefFloor(built.brief, built.findings, corpus);
      const failing = failedItems(floor);
      const expected = item.expectFailing ?? [];
      const passed = failing.length === expected.length && expected.every((entry) => failing.includes(entry));
      const metrics: Record<string, number> = { floor_passed: passed ? 1 : 0, sentences: sentences(built.brief).length, judge_ran: 0, judge_agreed: 0, judge_disagreed: 0, judge_unavailable: 0 };
      let detail = passed ? undefined : expected.length ? `floor failed ${JSON.stringify(failing)}, expected ${JSON.stringify(expected)}` : `floor failed ${JSON.stringify(failing)}: ${built.brief}`;
      if (judge) {
        if (index > 0) await sleep(options.modelDelayMs);
        const outcome = await judgeJson(JUDGE_PROMPT, `BRIEF\n${built.brief}\n\nFINDINGS\n${built.findings.map((finding) => `- ${finding.label} (${finding.result}; source: ${finding.source}): ${finding.detail}`).join("\n")}\n\nSOURCES\n${corpus}`, (text) => judgeSchema.parse(JSON.parse(text)));
        if ("error" in outcome) { metrics.judge_unavailable = 1; detail = `${detail ?? ""} [judge: ${outcome.error}]`.trim(); }
        else {
          metrics.judge_ran = 1;
          const judgeFailing = rubricItems.filter((entry) => !outcome.value[entry]);
          const agreed = judgeFailing.length === failing.length && failing.every((entry) => judgeFailing.includes(entry));
          metrics[agreed ? "judge_agreed" : "judge_disagreed"] = 1;
          const summary = `judge ${outcome.model}: ${judgeFailing.length ? `failed ${JSON.stringify(judgeFailing)}` : "all four items pass"}${outcome.value.notes ? ` — ${outcome.value.notes}` : ""}`;
          detail = agreed ? detail : `${detail ?? "floor passed"}; ${summary} (disagrees with the floor)`;
          options.log?.(`JUDGE brief-quality · ${item.name}: ${summary}${agreed ? "" : " ≠ floor"}`);
        }
      }
      results.push({ name: item.name, passed, detail, note: item.note, metrics });
      options.log?.(`${passed ? "PASS" : "FAIL"} brief-quality · ${item.name}`);
    }
    return results;
  },
};
