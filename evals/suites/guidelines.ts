import { buildFacts, evaluateFacts, type Extracted, type Intake } from "../../src/agent/analysis";
import { brokerAppetiteInstructions, caseAppetiteSchema, type CaseAppetite } from "../../src/lib/case-appetite";
import type { Finding } from "../../src/lib/types";
import { attempt, same, type CaseResult, type Suite } from "../runner";

/**
 * Case review against the carrier appetite. Given intake facts, the broker's
 * explicit appetite fields, and what extraction produced, the agent must reach
 * the right per-factor result on all eight rules, ask the broker only for what
 * is genuinely missing, and never treat a three-year claim count as five-year
 * loss dollars.
 */
type Concept = "business" | "line" | "state" | "tiv" | "premium" | "year" | "constructionPercent" | "lossValue";
type Expectation = {
  results: Partial<Record<Concept, Finding["result"]>>;
  needsBroker: boolean;
  /** Substrings the broker question must contain. */
  question?: string[];
  recommendation?: string;
  score?: number;
  sources?: Partial<Record<"yearBuilt" | "losses", string>>;
};
type Case = { name: string; intake: Intake; extracted: Extracted; expected: Expectation; note?: string };

const none: Extracted = { yearBuilt: null, losses: null };
const complete: CaseAppetite = caseAppetiteSchema.parse({ business: "new", line: "property", premium: 85_000, constructionPercent: 75, lossValue: 0, lossHistoryComplete: true, effective: "2026-01-01", expiration: "2027-01-01" });
const intake = (overrides: Partial<Intake> = {}, appetite: Partial<CaseAppetite> = {}): Intake => ({ insuredName: "Evaluation property", appetite: { ...complete, ...appetite }, state: "CO", tiv: 75_000_000, yearBuilt: 2015, losses: 0, ...overrides });
const allPass: Record<Concept, Finding["result"]> = { business: "pass", line: "pass", state: "pass", tiv: "pass", premium: "pass", year: "pass", constructionPercent: "pass", lossValue: "pass" };

export const guidelineCases: Case[] = [
  { name: "complete in-appetite case passes all eight rules", intake: intake(), extracted: none, expected: { results: allPass, needsBroker: false, recommendation: "Review for acceptance", score: 94 } },
  { name: "limits are inclusive", intake: intake({ tiv: 150_000_000, yearBuilt: 1991 }, { premium: 175_000, constructionPercent: 51 }), extracted: none, expected: { results: allPass, needsBroker: false } },
  { name: "out-of-appetite state is referred", intake: intake({ state: "NY" }), extracted: none, expected: { results: { state: "refer" }, needsBroker: false, recommendation: "Refer for appetite exceptions", score: 49 } },
  { name: "value above the appetite limit is referred", intake: intake({ tiv: 150_000_001 }), extracted: none, expected: { results: { tiv: "refer" }, needsBroker: false } },
  { name: "pre-1990 building is referred", intake: intake({ yearBuilt: 1972 }), extracted: none, expected: { results: { year: "refer" }, needsBroker: false } },
  { name: "building from exactly 1990 asks the broker", intake: intake({ yearBuilt: 1990 }), extracted: none, expected: { results: { year: "unknown" }, needsBroker: true, question: ["Building age"] } },
  { name: "renewal business is outside appetite", intake: intake({}, { business: "renewal" }), extracted: none, expected: { results: { business: "refer" }, needsBroker: false, recommendation: "Refer for appetite exceptions" }, note: "The supplied 2025 table lists renewal business as not acceptable." },
  { name: "missing year asks for the building age only", intake: intake({ yearBuilt: null }), extracted: none, expected: { results: { year: "unknown", lossValue: "pass" }, needsBroker: true, question: ["Please provide or clarify: Building age.", brokerAppetiteInstructions] } },
  { name: "extracted year fills what intake left blank and is attributed", intake: intake({ yearBuilt: null }), extracted: { yearBuilt: 2005, losses: 1 }, expected: { results: { year: "pass" }, needsBroker: false, sources: { yearBuilt: "Broker text" } } },
  { name: "intake overrides conflicting text", intake: intake({ yearBuilt: 2015, losses: 1 }), extracted: { yearBuilt: 1970, losses: 5 }, expected: { results: { year: "pass" }, needsBroker: false, sources: { yearBuilt: "Intake form", losses: "Intake form" } }, note: "The underwriter's typed values win; the disagreement surfaces as a conflict finding, not a silent override." },
  { name: "incomplete five-year history keeps loss value unknown", intake: intake({}, { lossHistoryComplete: false }), extracted: none, expected: { results: { lossValue: "unknown" }, needsBroker: true, question: ["Five-year loss value"], score: 69 }, note: "A $0 figure over an incomplete history is not a pass." },
  { name: "large losses are an exception even with incomplete history", intake: intake({}, { lossValue: 250_000, lossHistoryComplete: false }), extracted: none, expected: { results: { lossValue: "refer" }, needsBroker: false } },
  { name: "three-year claim count never becomes five-year loss dollars", intake: intake({ losses: 3 }), extracted: { yearBuilt: null, losses: 4 }, expected: { results: { lossValue: "pass" }, needsBroker: false }, note: "Counts and dollars are different facts; the guideline needs dollars." },
  { name: "missing premium asks for the premium", intake: intake({}, { premium: null }), extracted: none, expected: { results: { premium: "unknown" }, needsBroker: true, question: ["Total premium"] } },
  { name: "missing account name is required context", intake: intake({ insuredName: "" }), extracted: none, expected: { results: allPass, needsBroker: true, question: ["account name"] } },
  { name: "missing appetite fields list every gap", intake: intake({}, { business: null, line: null, premium: null, constructionPercent: null, lossValue: null, effective: null, expiration: null }), extracted: none, expected: { results: { business: "unknown", line: "unknown", premium: "unknown", constructionPercent: "unknown", lossValue: "unknown" }, needsBroker: true, question: ["effective date", "expiration date", "Submission type", "Line of business", "Total premium", "Construction mix", "Five-year loss value"] } },
  { name: "an exception and a missing fact both surface", intake: intake({ state: "NY" }, { premium: null }), extracted: none, expected: { results: { state: "refer", premium: "unknown" }, needsBroker: true, recommendation: "Refer for appetite exceptions", score: 49 } },
];

export const guidelineSuite: Suite = {
  name: "guidelines",
  description: "Carrier appetite review of a case: per-factor results, broker questions, and provenance",
  async run() {
    return guidelineCases.map<CaseResult>((item) => attempt(item.name, () => {
      const facts = buildFacts(item.intake, item.extracted);
      const result = evaluateFacts(facts);
      const results = Object.fromEntries(result.findings.map((finding) => [finding.id, finding.result]));
      const problems: string[] = [];
      if (result.findings.length !== 8) problems.push(`${result.findings.length} findings expected 8`);
      for (const [concept, expected] of Object.entries(item.expected.results)) if (results[concept] !== expected) problems.push(`${concept} ${results[concept]} expected ${expected}`);
      if (Boolean(result.question) !== item.expected.needsBroker) problems.push(`needsBroker ${Boolean(result.question)} expected ${item.expected.needsBroker}`);
      for (const part of item.expected.question ?? []) if (!result.question?.includes(part)) problems.push(`question "${result.question}" lacks "${part}"`);
      if (item.expected.recommendation && result.appetiteResult.recommendation !== item.expected.recommendation) problems.push(`recommendation ${result.appetiteResult.recommendation} expected ${item.expected.recommendation}`);
      if (item.expected.score !== undefined && result.appetiteResult.score !== item.expected.score) problems.push(`score ${result.appetiteResult.score} expected ${item.expected.score}`);
      for (const [field, source] of Object.entries(item.expected.sources ?? {})) if (facts[field as "yearBuilt" | "losses"].source !== source) problems.push(`${field} source ${facts[field as "yearBuilt" | "losses"].source} expected ${source}`);
      if (!result.brief.includes("underwriter makes the final decision")) problems.push("brief must say an underwriter decides");
      if (!same(result.findings.map((finding) => finding.id), ["business", "line", "state", "tiv", "premium", "year", "constructionPercent", "lossValue"])) problems.push("finding order changed");
      return problems;
    }, item.note));
  },
};
