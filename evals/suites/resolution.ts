import { resolveField, type FieldCandidate, type FieldValue, type Resolved, type ResolvedCandidate } from "../../src/agent/resolution";
import { attempt, same, type CaseResult, type Suite } from "../runner";

/**
 * Rox challenge: several imperfect sources for the same fact. The underwriter's
 * own intake wins outright; otherwise sources that agree beat one that does
 * not; a lone value is kept but with lower confidence; disagreement is always
 * surfaced as a conflict the reviewer can see, and confidence must reflect how
 * much support a value actually has. The same rules cover every field in the
 * schema: years and counts, dollars, yes/no answers, names, and dates. The
 * quote shown beside a value must come from a source that stated that value.
 */
type Candidate = FieldCandidate<FieldValue>;
const intake = (value: FieldValue | null, quote?: string): Candidate => ({ source: "Intake form", kind: "intake", value, quote });
const gemini = (value: FieldValue | null, quote?: string): Candidate => ({ source: "Gemini gemini-3.8-flash", kind: "model", value, quote });
const openai = (value: FieldValue | null, quote?: string): Candidate => ({ source: "OpenAI gpt-5-mini", kind: "model", value, quote });
const parser = (value: FieldValue | null, quote?: string): Candidate => ({ source: "Parser", kind: "parser", value, quote });

type Expectation = Partial<Pick<Resolved<FieldValue>, "value" | "source" | "confidence" | "quote">> & { conflictMentions?: string[]; noConflict?: boolean; confidenceAtLeast?: number; confidenceBelow?: number; candidates?: ResolvedCandidate<FieldValue>[] };
const cases: { name: string; label?: string; candidates: Candidate[]; expect: Expectation; note?: string }[] = [
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
  { name: "nothing known is null with zero confidence", candidates: [intake(null), gemini(null), openai(null), parser(null)], expect: { value: null, source: "Not provided", confidence: 0, noConflict: true, quote: null, candidates: [] } },
  { name: "zero is a value, not missing", candidates: [intake(null), gemini(0), parser(null)], expect: { value: 0, confidenceAtLeast: 0.7, noConflict: true }, note: "'No losses' resolves to 0 and must not be treated as unknown." },
  { name: "conflict text names the field and every source", label: "Recent loss count", candidates: [intake(null), gemini(3), openai(1), parser(3)], expect: { value: 3, conflictMentions: ["Recent loss count", "Gemini", "OpenAI", "Parser"] } },
  // The appetite fields: dollars, yes/no answers, names, and dates follow the same rules.
  { name: "premium dollars: two models agree against the parser's line", label: "Premium", candidates: [intake(null), gemini(90_000), openai(90_000), parser(85_000)], expect: { value: 90_000, confidenceAtLeast: 0.8, conflictMentions: ["Premium", "Parser", "85000"] }, note: "The explicit line is one reader among three; the reviewer sees that it was outvoted." },
  { name: "business type: the intake form settles a renewal-versus-new disagreement", label: "Business type", candidates: [intake("new"), gemini("renewal"), parser("new")], expect: { value: "new", source: "Intake form", confidence: 1, conflictMentions: ["Business type", "renewal"] } },
  { name: "history complete: false is a stated answer, not a missing one", label: "Five-year history complete", candidates: [intake(null), gemini(false), parser(null)], expect: { value: false, confidenceAtLeast: 0.7, noConflict: true }, note: "'Five-year history complete: no' must reach the appetite check as false, never as unknown." },
  { name: "history complete: a model and the parser agree on yes", label: "Five-year history complete", candidates: [intake(null), gemini(true), parser(true)], expect: { value: true, confidenceAtLeast: 0.85, noConflict: true } },
  { name: "line of business strings are compared exactly after normalisation", label: "Line of business", candidates: [intake(null), gemini("property"), openai("property"), parser("property")], expect: { value: "property", confidenceAtLeast: 0.9, noConflict: true } },
  { name: "policy dates resolve like any other field", label: "Effective date", candidates: [intake(null), gemini("2026-10-01"), openai("2026-01-10"), parser(null)], expect: { value: "2026-10-01", confidenceBelow: 0.6, conflictMentions: ["Effective date", "2026-01-10"] }, note: "A transposed day and month is exactly the disagreement a reviewer needs to see." },
  { name: "loss dollars: a lone parser line is kept at parser confidence", label: "Five-year loss value", candidates: [intake(null), gemini(null), openai(null), parser(250_000)], expect: { value: 250_000, source: "Parser", confidenceBelow: 0.75, noConflict: true } },
  // Quotes follow the value they support.
  { name: "the quote comes from a backer of the winning value, models first", candidates: [intake(null), gemini(2005, "Constructed in 2005."), openai(1988, "Built in 1988."), parser(2005, "Constructed in 2005.")], expect: { value: 2005, quote: "Constructed in 2005." } },
  { name: "a dissenter's quote is never attached to the winner", candidates: [intake(null), gemini(2005), openai(1988, "Built in 1988."), parser(2005)], expect: { value: 2005, quote: null }, note: "Showing 'Built in 1988.' under a value of 2005 would mislead the reviewer." },
  { name: "the parser's quote is used when the model gave none", candidates: [intake(null), gemini(2005), parser(2005, "Built in 2005.")], expect: { value: 2005, source: "Gemini gemini-3.8-flash", quote: "Built in 2005." } },
  { name: "intake keeps a quote from text that agrees with it", candidates: [intake(2012), gemini(2012, "Built in 2012."), parser(null)], expect: { value: 2012, source: "Intake form", quote: "Built in 2012.", noConflict: true } },
  { name: "intake takes no quote from text that disagrees, and the dissent is listed", candidates: [intake(2012), gemini(1970, "Built in 1970."), parser(null)], expect: { value: 2012, quote: null, candidates: [{ source: "Intake form", value: 2012 }, { source: "Gemini gemini-3.8-flash", value: 1970, quote: "Built in 1970." }] } },
  { name: "every stated source is listed in trust order with its quote", label: "Premium", candidates: [intake(null), gemini(90_000, "The premium is $90,000."), openai(85_000), parser(85_000, "Premium: $85,000")], expect: { value: 85_000, candidates: [{ source: "Gemini gemini-3.8-flash", value: 90_000, quote: "The premium is $90,000." }, { source: "OpenAI gpt-5-mini", value: 85_000 }, { source: "Parser", value: 85_000, quote: "Premium: $85,000" }] } },
];

export const resolutionSuite: Suite = {
  name: "resolution",
  description: "Multi-source fact resolution on every field: intake precedence, agreement, confidence, visible conflicts, and quotes that follow the value",
  async run() {
    return cases.map<CaseResult>((item) => attempt(item.name, () => {
      const result = resolveField(item.label ?? "Year built", item.candidates);
      const problems: string[] = [];
      if ("value" in item.expect && result.value !== item.expect.value) problems.push(`value ${result.value} expected ${item.expect.value}`);
      if (item.expect.source && result.source !== item.expect.source) problems.push(`source ${result.source} expected ${item.expect.source}`);
      if (item.expect.confidence !== undefined && result.confidence !== item.expect.confidence) problems.push(`confidence ${result.confidence} expected ${item.expect.confidence}`);
      if (item.expect.confidenceAtLeast !== undefined && result.confidence < item.expect.confidenceAtLeast) problems.push(`confidence ${result.confidence} below ${item.expect.confidenceAtLeast}`);
      if (item.expect.confidenceBelow !== undefined && result.confidence >= item.expect.confidenceBelow) problems.push(`confidence ${result.confidence} not below ${item.expect.confidenceBelow}`);
      if (item.expect.noConflict && result.conflict !== null) problems.push(`unexpected conflict "${result.conflict}"`);
      for (const mention of item.expect.conflictMentions ?? []) if (!result.conflict?.includes(mention)) problems.push(`conflict "${result.conflict}" lacks "${mention}"`);
      if ("quote" in item.expect && result.quote !== item.expect.quote) problems.push(`quote ${JSON.stringify(result.quote)} expected ${JSON.stringify(item.expect.quote)}`);
      if (item.expect.candidates && !same(result.candidates, item.expect.candidates)) problems.push(`candidates ${JSON.stringify(result.candidates)} expected ${JSON.stringify(item.expect.candidates)}`);
      if (result.quote !== null && !item.candidates.some((candidate) => candidate.value === result.value && candidate.quote === result.quote)) problems.push(`quote "${result.quote}" does not come from a source that stated ${result.value}`);
      if (result.confidence < 0 || result.confidence > 1) problems.push("confidence out of range");
      return problems;
    }, item.note));
  },
};
