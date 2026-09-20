import { planQuery } from "../../src/federato/schema";
import { scoreSubmission, type Criterion } from "../../src/federato/scoring";
import { deriveFacts } from "../../src/federato/derive";
import { counterfactuals } from "../../src/federato/counterfactual";
import { same, type CaseResult, type Suite } from "../runner";

/**
 * Federato appetite scoring against the supplied 2025 commercial property
 * table. Each case pins the recommendation and the per-factor status so a
 * threshold slip on any single factor is caught even when the recommendation
 * happens to stay the same.
 */
const asOf = new Date("2026-09-19T00:00:00Z");
const flatFields = {
  id: { type: "number" }, account_name: { type: "string" }, primary_risk_state: { type: "string" }, business_type: { type: "string" }, line_of_business: { type: "string" },
  tiv: { type: "number" }, premium: { type: "number" }, year_built: { type: "number" }, acceptable_construction_percent: { type: "number" }, five_year_loss_value: { type: "number" }, effective_date: { type: "string" }, expiration_date: { type: "string" },
};
const flatPlan = planQuery({ Policy: { type: "object", fields: flatFields } });
const base = { id: 1, account_name: "Evaluation property", primary_risk_state: "CA", business_type: "new", line_of_business: "property", tiv: 75_000_000, premium: 85_000, year_built: 2015, acceptable_construction_percent: 75, five_year_loss_value: 0, effective_date: "2026-01-01", expiration_date: "2027-01-01" };

type Status = Criterion["status"];
type Factor = "Submission type" | "Line of business" | "Primary risk state" | "Total insured value" | "Total premium" | "Building age" | "Construction mix" | "Five-year loss value";
type Expectation = { recommendation: "Review for acceptance" | "Investigate missing or ambiguous data" | "Refer for appetite exceptions"; criteria?: Partial<Record<Factor, Status>>; score?: number; scoreAtMost?: number; missing?: string[] };
type Case = { name: string; row: Record<string, unknown>; expected: Expectation; note?: string };

const flatCases: Case[] = [
  { name: "new business in a target state is ready for review", row: base, expected: { recommendation: "Review for acceptance", score: 94, criteria: { "Submission type": "acceptable", "Line of business": "acceptable", "Primary risk state": "target", "Total insured value": "target", "Total premium": "target", "Building age": "target", "Construction mix": "acceptable", "Five-year loss value": "target" } } },
  { name: "renewal business is outside appetite", row: { ...base, business_type: "renewal" }, expected: { recommendation: "Refer for appetite exceptions", score: 49, criteria: { "Submission type": "outside" } }, note: "Appetite Guidelines page 2 lists renewal business under Not Acceptable; 94 is the highest reachable score because no factor beyond the six targets has a target tier." },
  { name: "acceptable state scores lower but is not an exception", row: { ...base, primary_risk_state: "GA" }, expected: { recommendation: "Review for acceptance", score: 91, criteria: { "Primary risk state": "acceptable" } } },
  { name: "out-of-appetite state is referred and capped", row: { ...base, primary_risk_state: "NY" }, expected: { recommendation: "Refer for appetite exceptions", score: 49, criteria: { "Primary risk state": "outside" } } },
  { name: "state casing and whitespace are normalized", row: { ...base, primary_risk_state: " oh " }, expected: { recommendation: "Review for acceptance", criteria: { "Primary risk state": "target" } } },
  { name: "TIV at the $150M limit is acceptable", row: { ...base, tiv: 150_000_000 }, expected: { recommendation: "Review for acceptance", criteria: { "Total insured value": "acceptable" } } },
  { name: "TIV one dollar over the limit is an exception", row: { ...base, tiv: 150_000_001 }, expected: { recommendation: "Refer for appetite exceptions", criteria: { "Total insured value": "outside" } } },
  { name: "TIV below the target band is acceptable", row: { ...base, tiv: 20_000_000 }, expected: { recommendation: "Review for acceptance", criteria: { "Total insured value": "acceptable" } } },
  { name: "zero TIV is unknown, not a small risk", row: { ...base, tiv: 0 }, expected: { recommendation: "Investigate missing or ambiguous data", criteria: { "Total insured value": "unknown" } } },
  { name: "premium at both ends of the acceptable band", row: { ...base, premium: 50_000 }, expected: { recommendation: "Review for acceptance", criteria: { "Total premium": "acceptable" } } },
  { name: "premium at the top of the acceptable band", row: { ...base, premium: 175_000 }, expected: { recommendation: "Review for acceptance", criteria: { "Total premium": "acceptable" } } },
  { name: "premium under the minimum is an exception", row: { ...base, premium: 49_999 }, expected: { recommendation: "Refer for appetite exceptions", criteria: { "Total premium": "outside" } } },
  { name: "premium supplied as text is unknown", row: { ...base, premium: "85000" }, expected: { recommendation: "Investigate missing or ambiguous data", criteria: { "Total premium": "unknown" }, missing: ["Total premium"] } },
  { name: "building from 1991 is acceptable", row: { ...base, year_built: 1991 }, expected: { recommendation: "Review for acceptance", criteria: { "Building age": "acceptable" } } },
  { name: "building from 2010 is acceptable, 2011 is target", row: { ...base, year_built: 2010 }, expected: { recommendation: "Review for acceptance", criteria: { "Building age": "acceptable" } } },
  { name: "building from 2011 is the target", row: { ...base, year_built: 2011 }, expected: { recommendation: "Review for acceptance", criteria: { "Building age": "target" } } },
  { name: "building from exactly 1990 needs clarification", row: { ...base, year_built: 1990 }, expected: { recommendation: "Investigate missing or ambiguous data", criteria: { "Building age": "unknown" }, scoreAtMost: 69 } },
  { name: "building from 1989 is an exception", row: { ...base, year_built: 1989 }, expected: { recommendation: "Refer for appetite exceptions", criteria: { "Building age": "outside" } } },
  { name: "future construction year is unknown", row: { ...base, year_built: 2030 }, expected: { recommendation: "Investigate missing or ambiguous data", criteria: { "Building age": "unknown" } } },
  { name: "construction share above half is acceptable", row: { ...base, acceptable_construction_percent: 51 }, expected: { recommendation: "Review for acceptance", criteria: { "Construction mix": "acceptable" } } },
  { name: "construction share of exactly half needs clarification", row: { ...base, acceptable_construction_percent: 50 }, expected: { recommendation: "Investigate missing or ambiguous data", criteria: { "Construction mix": "unknown" } } },
  { name: "construction share below half is an exception", row: { ...base, acceptable_construction_percent: 49 }, expected: { recommendation: "Refer for appetite exceptions", criteria: { "Construction mix": "outside" } } },
  { name: "construction share over 100 is invalid", row: { ...base, acceptable_construction_percent: 101 }, expected: { recommendation: "Investigate missing or ambiguous data", criteria: { "Construction mix": "unknown" } } },
  { name: "losses under $100K are the target", row: { ...base, five_year_loss_value: 99_999 }, expected: { recommendation: "Review for acceptance", criteria: { "Five-year loss value": "target" } } },
  { name: "losses of exactly $100K need clarification", row: { ...base, five_year_loss_value: 100_000 }, expected: { recommendation: "Investigate missing or ambiguous data", criteria: { "Five-year loss value": "unknown" } } },
  { name: "losses over $100K are an exception", row: { ...base, five_year_loss_value: 100_001 }, expected: { recommendation: "Refer for appetite exceptions", criteria: { "Five-year loss value": "outside" } } },
  { name: "non-property line is an exception", row: { ...base, line_of_business: "General Liability" }, expected: { recommendation: "Refer for appetite exceptions", criteria: { "Line of business": "outside" } } },
  { name: "commercial property spelling is accepted", row: { ...base, line_of_business: "Commercial_Property" }, expected: { recommendation: "Review for acceptance", criteria: { "Line of business": "acceptable" } } },
  { name: "unfamiliar submission type is unknown, not rejected", row: { ...base, business_type: "endorsement" }, expected: { recommendation: "Investigate missing or ambiguous data", criteria: { "Submission type": "unknown" } } },
  { name: "expiration before effective is flagged", row: { ...base, effective_date: "2027-01-01", expiration_date: "2026-01-01" }, expected: { recommendation: "Investigate missing or ambiguous data", missing: ["valid effective/expiration date order"] } },
  { name: "impossible calendar date is flagged", row: { ...base, effective_date: "2026-02-30" }, expected: { recommendation: "Investigate missing or ambiguous data", missing: ["effective date"] } },
  { name: "blank account name is flagged", row: { ...base, account_name: "  " }, expected: { recommendation: "Investigate missing or ambiguous data", missing: ["account name"] } },
  { name: "an exception outranks missing data in the recommendation", row: { ...base, primary_risk_state: "TX", premium: null }, expected: { recommendation: "Refer for appetite exceptions", scoreAtMost: 49, criteria: { "Primary risk state": "outside", "Total premium": "unknown" } } },
  { name: "everything wrong still produces a full explanation", row: { id: 2 }, expected: { recommendation: "Investigate missing or ambiguous data", scoreAtMost: 69 } },
];

/** Nested Policy rows resembling the live schema: exposure buildings, locations, claims, currency. */
const n = { type: "number" }, s = { type: "string" };
const nestedSchema = {
  Policy: { type: "object", fields: {
    id: n, premium: n, currency: s, business_type: s, line_of_business: s, account_name: s, effective_date: s, expiration_date: s,
    exposure_units: { type: "reference", resource: "Exposure", cardinality: "many" },
    claims: { type: "reference", resource: "Claim", cardinality: "many" },
  } },
  Exposure: { type: "object", fields: { location: { type: "reference", resource: "Location", cardinality: "one" } } },
  Location: { type: "object", fields: { id: n, state: s, buildings: { type: "reference", resource: "Building", cardinality: "many" } } },
  Building: { type: "object", fields: { id: n, year_built: n, tiv: n, construction_type: s } },
  Claim: { type: "object", fields: { id: n, date_of_loss: s, paid_indemnity: n, paid_expense: n, reserve_indemnity: n, reserve_expense: n } },
};
const nestedPlan = planQuery(nestedSchema);
const building = (id: number, overrides: Record<string, unknown> = {}) => ({ id, tiv: 30_000_000, year_built: 2015, construction_type: "joisted_masonry", ...overrides });
const location = (id: number, state: string, buildings: Record<string, unknown>[]) => ({ id, state, buildings });
const claim = (id: number, date_of_loss: string, paid: number) => ({ id, date_of_loss, paid_indemnity: paid, paid_expense: 0, reserve_indemnity: 0, reserve_expense: 0 });
const nestedBase = { id: 10, premium: 90_000, currency: "USD", business_type: "new", line_of_business: "property", account_name: "Nested Holdings", effective_date: "2026-03-01", expiration_date: "2027-03-01" };

const nestedCases: Case[] = [
  { name: "nested: building TIV sums and the oldest building governs age", row: { ...nestedBase, exposure_units: [{ location: location(1, "OH", [building(1), building(2, { year_built: 1995 })]) }], claims: [] }, expected: { recommendation: "Investigate missing or ambiguous data", criteria: { "Total insured value": "target", "Building age": "acceptable", "Primary risk state": "target", "Five-year loss value": "unknown", "Construction mix": "acceptable" } }, note: "Policy-linked claims never establish complete five-year history, so an empty claims list stays unknown rather than passing." },
  { name: "nested: the same location referenced twice is counted once", row: { ...nestedBase, exposure_units: [{ location: location(1, "OH", [building(1)]) }, { location: location(1, "OH", [building(1)]) }], claims: [] }, expected: { recommendation: "Investigate missing or ambiguous data", criteria: { "Total insured value": "acceptable" } }, note: "Double-counting a shared location would push $30M into the $50M target band." },
  { name: "nested: locations in different states leave the primary state unknown", row: { ...nestedBase, exposure_units: [{ location: location(1, "OH", [building(1)]) }, { location: location(2, "PA", [building(2)]) }], claims: [] }, expected: { recommendation: "Investigate missing or ambiguous data", criteria: { "Primary risk state": "unknown" } } },
  { name: "nested: a pre-1990 building is an exception even when another year is missing", row: { ...nestedBase, exposure_units: [{ location: location(1, "OH", [building(1, { year_built: 1985 }), building(2, { year_built: null })]) }], claims: [] }, expected: { recommendation: "Refer for appetite exceptions", criteria: { "Building age": "outside" } } },
  { name: "nested: frame construction majority is an exception", row: { ...nestedBase, exposure_units: [{ location: location(1, "OH", [building(1, { construction_type: "frame" }), building(2, { construction_type: "frame" }), building(3)]) }], claims: [] }, expected: { recommendation: "Refer for appetite exceptions", criteria: { "Construction mix": "outside" } } },
  { name: "nested: an unrecognized construction label keeps the mix unknown", row: { ...nestedBase, exposure_units: [{ location: location(1, "OH", [building(1, { construction_type: "tilt-up" })]) }], claims: [] }, expected: { recommendation: "Investigate missing or ambiguous data", criteria: { "Construction mix": "unknown" } } },
  { name: "nested: claims inside five years sum to an exception", row: { ...nestedBase, exposure_units: [{ location: location(1, "OH", [building(1)]) }], claims: [claim(1, "2024-05-01", 60_000), claim(2, "2025-06-01", 50_000)] }, expected: { recommendation: "Refer for appetite exceptions", criteria: { "Five-year loss value": "outside" } } },
  { name: "nested: claims older than five years are excluded from the lower bound", row: { ...nestedBase, exposure_units: [{ location: location(1, "OH", [building(1)]) }], claims: [claim(1, "2019-05-01", 500_000), claim(2, "2025-06-01", 10_000)] }, expected: { recommendation: "Investigate missing or ambiguous data", criteria: { "Five-year loss value": "unknown" } }, note: "$500K from 2019 is outside the window; the $10K inside it is only a lower bound, never a pass." },
  { name: "nested: an in-window claim with no amounts leaves losses unknown", row: { ...nestedBase, exposure_units: [{ location: location(1, "OH", [building(1)]) }], claims: [{ id: 1, date_of_loss: "2025-06-01" }] }, expected: { recommendation: "Investigate missing or ambiguous data", criteria: { "Five-year loss value": "unknown" } } },
  { name: "nested: non-USD currency blanks every dollar factor", row: { ...nestedBase, currency: "CAD", exposure_units: [{ location: location(1, "OH", [building(1)]) }], claims: [] }, expected: { recommendation: "Investigate missing or ambiguous data", criteria: { "Total insured value": "unknown", "Total premium": "unknown", "Five-year loss value": "unknown" } } },
  { name: "nested: a building without TIV leaves the total unknown rather than partial", row: { ...nestedBase, exposure_units: [{ location: location(1, "OH", [building(1), building(2, { tiv: null })]) }], claims: [] }, expected: { recommendation: "Investigate missing or ambiguous data", criteria: { "Total insured value": "unknown" } } },
];

function check(item: Case, plan: typeof flatPlan, nested: boolean): CaseResult {
  const derived = nested ? deriveFacts(item.row, plan, asOf) : { row: item.row, mapping: plan.mapping };
  const result = scoreSubmission(derived.row, derived.mapping, "id", asOf);
  const problems: string[] = [];
  if (result.recommendation !== item.expected.recommendation) problems.push(`recommendation "${result.recommendation}" expected "${item.expected.recommendation}"`);
  if (item.expected.score !== undefined && result.score !== item.expected.score) problems.push(`score ${result.score} expected ${item.expected.score}`);
  if (item.expected.scoreAtMost !== undefined && result.score > item.expected.scoreAtMost) problems.push(`score ${result.score} above cap ${item.expected.scoreAtMost}`);
  for (const [factor, status] of Object.entries(item.expected.criteria ?? {})) {
    const actual = result.criteria.find((criterion) => criterion.factor === factor)?.status;
    if (actual !== status) problems.push(`${factor} ${actual} expected ${status}`);
  }
  for (const missing of item.expected.missing ?? []) if (!result.missingData.includes(missing)) problems.push(`missingData ${JSON.stringify(result.missingData)} lacks "${missing}"`);
  if (result.criteria.length !== 8) problems.push(`${result.criteria.length} criteria expected 8`);
  if (!result.explanation.includes("underwriter makes the final decision")) problems.push("explanation must state that an underwriter decides");
  if (!same(result.criteria.map((criterion) => criterion.factor), ["Submission type", "Line of business", "Primary risk state", "Total insured value", "Total premium", "Building age", "Construction mix", "Five-year loss value"])) problems.push("factor order changed");
  // Counterfactuals probe the scorer with patched copies; the row and its score must come out untouched.
  const suggestions = counterfactuals(derived.row, derived.mapping, "id", asOf);
  const again = scoreSubmission(derived.row, derived.mapping, "id", asOf);
  if (!same(again, result)) problems.push("computing counterfactuals changed the score");
  if (result.recommendation === "Review for acceptance" ? suggestions.length > 0 : suggestions.some((entry) => !["outside", "unknown"].includes(result.criteria.find((criterion) => criterion.concept === entry.concept)?.status ?? ""))) problems.push("counterfactuals disagree with the criteria");
  return { name: item.name, passed: problems.length === 0, detail: problems.join("; ") || undefined, note: item.note };
}

export const appetiteSuite: Suite = {
  name: "appetite",
  description: "Federato 2025 appetite scoring: per-factor thresholds, caps, nested exposure derivation",
  async run() {
    return [...flatCases.map((item) => check(item, flatPlan, false)), ...nestedCases.map((item) => check(item, nestedPlan, true))];
  },
};
