import { buildFacts, evaluateFacts, type Extracted, type Intake } from "../../src/agent/analysis";
import type { Finding } from "../../src/lib/types";
import { same, type CaseResult, type Suite } from "../runner";

/**
 * Demo guideline decisions. Given intake facts plus what extraction produced,
 * the agent must reach the right per-rule result, ask the broker only when a
 * required fact is genuinely missing, and never approve anything itself.
 */
type Expectation = {
  results: Record<"territory" | "tiv" | "construction" | "losses", Finding["result"]>;
  needsBroker: boolean;
  /** Substrings the broker question must contain, in order. */
  question?: string[];
  /** Substring the brief must contain. */
  brief?: RegExp;
  /** Sources the case view must show for the facts that came from text. */
  sources?: Partial<Record<"yearBuilt" | "losses", string>>;
};
type Case = { name: string; intake: Intake; extracted: Extracted; expected: Expectation; note?: string };

const none: Extracted = { yearBuilt: null, losses: null };
const inTerritory = (overrides: Partial<Intake> = {}): Intake => ({ state: "NY", tiv: 2_400_000, yearBuilt: 2012, losses: 0, ...overrides });

export const guidelineCases: Case[] = [
  { name: "clean in-territory risk passes every rule", intake: inTerritory(), extracted: none, expected: { results: { territory: "pass", tiv: "pass", construction: "pass", losses: "pass" }, needsBroker: false, brief: /No exceptions found/ } },
  { name: "out-of-territory state is referred", intake: inTerritory({ state: "CO" }), extracted: none, expected: { results: { territory: "refer", tiv: "pass", construction: "pass", losses: "pass" }, needsBroker: false, brief: /1 guideline exception requires underwriter review: territory/ } },
  { name: "value above the demo limit is referred", intake: inTerritory({ state: "NJ", tiv: 6_800_000, yearBuilt: 1974, losses: 1 }), extracted: none, expected: { results: { territory: "pass", tiv: "refer", construction: "refer", losses: "pass" }, needsBroker: false, brief: /2 guideline exceptions require underwriter review: total insured value, year built/ } },
  { name: "loss count above two is referred", intake: inTerritory({ state: "PA", tiv: 4_100_000, yearBuilt: 1999, losses: 4 }), extracted: none, expected: { results: { territory: "pass", tiv: "pass", construction: "pass", losses: "refer" }, needsBroker: false } },
  { name: "limits are inclusive", intake: inTerritory({ state: "NJ", tiv: 5_000_000, yearBuilt: 1980, losses: 2 }), extracted: none, expected: { results: { territory: "pass", tiv: "pass", construction: "pass", losses: "pass" }, needsBroker: false } },
  { name: "one past each limit is referred", intake: inTerritory({ tiv: 5_000_001, yearBuilt: 1979, losses: 3 }), extracted: none, expected: { results: { territory: "pass", tiv: "refer", construction: "refer", losses: "refer" }, needsBroker: false } },
  { name: "missing year asks the broker for the year only", intake: inTerritory({ yearBuilt: null }), extracted: { yearBuilt: null, losses: 0 }, expected: { results: { territory: "pass", tiv: "pass", construction: "unknown", losses: "pass" }, needsBroker: true, question: ["year built"], brief: /Required information is still missing/ } },
  { name: "missing both facts asks for both", intake: inTerritory({ yearBuilt: null, losses: null }), extracted: none, expected: { results: { territory: "pass", tiv: "pass", construction: "unknown", losses: "unknown" }, needsBroker: true, question: ["year built", "number of losses in the past three years"] } },
  { name: "extracted text fills what intake left blank and is attributed", intake: inTerritory({ yearBuilt: null, losses: null }), extracted: { yearBuilt: 2005, losses: 1 }, expected: { results: { territory: "pass", tiv: "pass", construction: "pass", losses: "pass" }, needsBroker: false, sources: { yearBuilt: "Broker text", losses: "Broker text" } } },
  { name: "intake overrides conflicting text", intake: inTerritory({ yearBuilt: 2012, losses: 1 }), extracted: { yearBuilt: 1970, losses: 5 }, expected: { results: { territory: "pass", tiv: "pass", construction: "pass", losses: "pass" }, needsBroker: false, sources: { yearBuilt: "Intake form", losses: "Intake form" } }, note: "The underwriter's typed values win; the text becomes a conflict finding elsewhere, not a silent override." },
  { name: "extracted exception is still referred, not asked about", intake: inTerritory({ yearBuilt: null, losses: null }), extracted: { yearBuilt: 1965, losses: 3 }, expected: { results: { territory: "pass", tiv: "pass", construction: "refer", losses: "refer" }, needsBroker: false } },
  { name: "lowercase state is normalized", intake: inTerritory({ state: "ny" }), extracted: none, expected: { results: { territory: "pass", tiv: "pass", construction: "pass", losses: "pass" }, needsBroker: false } },
  { name: "blank state cannot pass territory", intake: inTerritory({ state: "" }), extracted: none, expected: { results: { territory: "refer", tiv: "pass", construction: "pass", losses: "pass" }, needsBroker: false } },
  { name: "missing facts and an exception both surface", intake: inTerritory({ tiv: 9_000_000, yearBuilt: null, losses: null }), extracted: none, expected: { results: { territory: "pass", tiv: "refer", construction: "unknown", losses: "unknown" }, needsBroker: true, brief: /1 guideline exception requires underwriter review: total insured value\. Required information is still missing/ } },
];

export const guidelineSuite: Suite = {
  name: "guidelines",
  description: "Demo guideline checks: per-rule results, broker questions, and brief wording",
  async run() {
    return guidelineCases.map<CaseResult>((item) => {
      const facts = buildFacts(item.intake, item.extracted);
      const result = evaluateFacts(facts);
      const results = Object.fromEntries(result.findings.map((finding) => [finding.id, finding.result]));
      const problems: string[] = [];
      if (!same(results, item.expected.results)) problems.push(`results ${JSON.stringify(results)} expected ${JSON.stringify(item.expected.results)}`);
      if (Boolean(result.question) !== item.expected.needsBroker) problems.push(`needsBroker ${Boolean(result.question)} expected ${item.expected.needsBroker}`);
      for (const part of item.expected.question ?? []) if (!result.question?.includes(part)) problems.push(`question "${result.question}" lacks "${part}"`);
      if (item.expected.brief && !item.expected.brief.test(result.brief)) problems.push(`brief "${result.brief}" does not match ${item.expected.brief}`);
      for (const [field, source] of Object.entries(item.expected.sources ?? {})) if (facts[field as "yearBuilt" | "losses"].source !== source) problems.push(`${field} source ${facts[field as "yearBuilt" | "losses"].source} expected ${source}`);
      return { name: item.name, passed: problems.length === 0, detail: problems.join("; ") || undefined, note: item.note };
    });
  },
};
