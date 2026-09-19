import { resolveField, type FieldCandidate, type Resolved } from "../../src/agent/resolution";
import { attempt, type CaseResult, type Suite } from "../runner";

/**
 * Rox challenge: several imperfect sources for the same fact. The underwriter's
 * own intake wins outright; otherwise sources that agree beat one that does
 * not; a lone value is kept but with lower confidence; disagreement is always
 * surfaced as a conflict the reviewer can see, and confidence must reflect how
 * much support a value actually has.
 */
const intake = (value: number | null): FieldCandidate => ({ source: "Intake form", kind: "intake", value });
const gemini = (value: number | null): FieldCandidate => ({ source: "Gemini gemini-3.8-flash", kind: "model", value });
const openai = (value: number | null): FieldCandidate => ({ source: "OpenAI gpt-5-mini", kind: "model", value });
const parser = (value: number | null): FieldCandidate => ({ source: "Parser", kind: "parser", value });

const cases: { name: string; candidates: FieldCandidate[]; expect: Partial<Resolved> & { conflictMentions?: string[]; noConflict?: boolean; confidenceAtLeast?: number; confidenceBelow?: number }; note?: string }[] = [
  { name: "intake always wins", candidates: [intake(2012), gemini(1970), parser(1970)], expect: { value: 2012, source: "Intake form", confidence: 1, conflictMentions: ["1970"] }, note: "The underwriter typed it; the disagreement is still shown." },
  { name: "intake wins without a conflict when text agrees", candidates: [intake(2012), gemini(2012), parser(2012)], expect: { value: 2012, source: "Intake form", confidence: 1, noConflict: true } },
  { name: "intake wins and blank text is not a conflict", candidates: [intake(2012), gemini(null), parser(null)], expect: { value: 2012, source: "Intake form", confidence: 1, noConflict: true } },
  { name: "two models and the parser agree", candidates: [intake(null), gemini(2005), openai(2005), parser(2005)], expect: { value: 2005, confidenceAtLeast: 0.9, noConflict: true } },
  { name: "majority beats a single dissenting model", candidates: [intake(null), gemini(2005), openai(1988), parser(2005)], expect: { value: 2005, confidenceAtLeast: 0.8, confidenceBelow: 1, conflictMentions: ["OpenAI", "1988"] } },
  { name: "majority beats a dissenting parser", candidates: [intake(null), gemini(2005), openai(2005), parser(1988)], expect: { value: 2005, confidenceAtLeast: 0.8, conflictMentions: ["Parser", "1988"] } },
  { name: "two models disagree with no tiebreaker keeps the first model at low confidence", candidates: [intake(null), gemini(2005), openai(1988), parser(null)], expect: { value: 2005, source: "Gemini gemini-3.8-flash", confidenceBelow: 0.6, conflictMentions: ["Gemini", "OpenAI"] }, note: "The reviewer sees a low-confidence value and the disagreement, never a silent pick." },
  { name: "model and parser disagree keeps the model at low confidence", candidates: [intake(null), gemini(2005), parser(1988)], expect: { value: 2005, confidenceBelow: 0.6, conflictMentions: ["Parser", "1988"] } },
  { name: "three-way disagreement is the lowest confidence of all", candidates: [intake(null), gemini(2005), openai(1988), parser(1972)], expect: { value: 2005, confidenceBelow: 0.5, conflictMentions: ["2005", "1988", "1972"] } },
  { name: "a lone model value is kept with moderate confidence", candidates: [intake(null), gemini(2005), parser(null)], expect: { value: 2005, source: "Gemini gemini-3.8-flash", confidenceAtLeast: 0.7, confidenceBelow: 0.9, noConflict: true } },
  { name: "a lone parser value is weaker than a lone model value", candidates: [intake(null), gemini(null), parser(2005)], expect: { value: 2005, source: "Parser", confidenceBelow: 0.75, noConflict: true } },
  { name: "model and parser agreeing beats either alone", candidates: [intake(null), gemini(2005), parser(2005)], expect: { value: 2005, confidenceAtLeast: 0.85, noConflict: true } },
  { name: "nothing known is null with zero confidence", candidates: [intake(null), gemini(null), openai(null), parser(null)], expect: { value: null, source: "Not provided", confidence: 0, noConflict: true } },
  { name: "zero is a value, not missing", candidates: [intake(null), gemini(0), parser(null)], expect: { value: 0, confidenceAtLeast: 0.7, noConflict: true }, note: "'No losses' resolves to 0 and must not be treated as unknown." },
  { name: "conflict text names the field and every source", candidates: [intake(null), gemini(3), openai(1), parser(3)], expect: { value: 3, conflictMentions: ["Recent loss count", "Gemini", "OpenAI", "Parser"] } },
];

export const resolutionSuite: Suite = {
  name: "resolution",
  description: "Multi-source fact resolution: intake precedence, agreement, confidence, and visible conflicts",
  async run() {
    return cases.map<CaseResult>((item) => attempt(item.name, () => {
      const label = item.name.includes("loss") ? "Recent loss count" : "Year built";
      const result = resolveField(label, item.candidates);
      const problems: string[] = [];
      if ("value" in item.expect && result.value !== item.expect.value) problems.push(`value ${result.value} expected ${item.expect.value}`);
      if (item.expect.source && result.source !== item.expect.source) problems.push(`source ${result.source} expected ${item.expect.source}`);
      if (item.expect.confidence !== undefined && result.confidence !== item.expect.confidence) problems.push(`confidence ${result.confidence} expected ${item.expect.confidence}`);
      if (item.expect.confidenceAtLeast !== undefined && result.confidence < item.expect.confidenceAtLeast) problems.push(`confidence ${result.confidence} below ${item.expect.confidenceAtLeast}`);
      if (item.expect.confidenceBelow !== undefined && result.confidence >= item.expect.confidenceBelow) problems.push(`confidence ${result.confidence} not below ${item.expect.confidenceBelow}`);
      if (item.expect.noConflict && result.conflict !== null) problems.push(`unexpected conflict "${result.conflict}"`);
      for (const mention of item.expect.conflictMentions ?? []) if (!result.conflict?.includes(mention)) problems.push(`conflict "${result.conflict}" lacks "${mention}"`);
      if (result.confidence < 0 || result.confidence > 1) problems.push("confidence out of range");
      return problems;
    }, item.note));
  },
};
