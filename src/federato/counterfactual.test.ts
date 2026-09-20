import assert from "node:assert/strict";
import test from "node:test";
import { applyPatch, counterfactuals, describeCounterfactuals, whatIf, type Counterfactual } from "./counterfactual";
import { deriveFacts } from "./derive";
import { planQuery } from "./schema";
import { scoreSubmission } from "./scoring";

const asOf = new Date("2026-09-19T00:00:00Z");
const fields = {
  id: { type: "number" }, account_name: { type: "string" }, primary_risk_state: { type: "string" }, business_type: { type: "string" }, line_of_business: { type: "string" },
  tiv: { type: "number" }, premium: { type: "number" }, year_built: { type: "number" }, acceptable_construction_percent: { type: "number" }, five_year_loss_value: { type: "number" }, effective_date: { type: "string" }, expiration_date: { type: "string" },
};
const plan = planQuery({ Policy: { type: "object", fields } });
const mapping = plan.mapping;
const base = { id: 1, account_name: "Evaluation property", primary_risk_state: "CA", business_type: "new", line_of_business: "property", tiv: 75_000_000, premium: 85_000, year_built: 2015, acceptable_construction_percent: 75, five_year_loss_value: 0, effective_date: "2026-01-01", expiration_date: "2027-01-01" };

const run = (overrides: Record<string, unknown>) => counterfactuals({ ...base, ...overrides }, mapping, "id", asOf);
const passes = (row: Record<string, unknown>, concept: string) => ["target", "acceptable"].includes(scoreSubmission(row, mapping, "id", asOf).criteria.find((item) => item.concept === concept)!.status);
/** The boundary must come from the scorer: the required value passes and one step back toward the current value does not. */
function assertBoundary(item: Counterfactual, row: Record<string, unknown>, current: number | null) {
  const required = item.requiredValue as number;
  assert.ok(passes(applyPatch(row, mapping, { [item.concept]: required }), item.concept), `${item.factor}: ${required} should pass`);
  const towardCurrent = current === null || current < required ? required - 1 : required + 1;
  assert.ok(!passes(applyPatch(row, mapping, { [item.concept]: towardCurrent }), item.concept), `${item.factor}: ${towardCurrent} should not pass`);
}

test("a submission fully inside appetite has nothing to change", () => {
  assert.deepEqual(run({}), []);
  assert.deepEqual(run({ primary_risk_state: "GA", tiv: 20_000_000, year_built: 2005 }), []);
});

test("renewal business is an immutable fact, phrased as a condition", () => {
  const [item, ...rest] = run({ business_type: "renewal" });
  assert.equal(rest.length, 0);
  assert.equal(item.concept, "business");
  assert.equal(item.factor, "Submission type");
  assert.equal(item.status, "outside");
  assert.equal(item.currentValue, "renewal");
  assert.equal(item.requiredValue, "new");
  assert.equal(item.projectedScore, 94);
  assert.equal(item.projectedAction, "Review for acceptance");
  assert.equal(item.condition, "Had this been new business, it would score 94 and pass.");
  assert.equal(item.sentence, "This is outside appetite at 49/100. Had this been new business, it would score 94 and pass.");
});

test("a non-property line names the line the appetite covers", () => {
  const [item] = run({ line_of_business: "General Liability" });
  assert.equal(item.concept, "line");
  assert.equal(item.requiredValue, "property");
  assert.equal(item.condition, "Had the line of business been property, it would score 94 and pass.");
});

test("an out-of-appetite state lists every state the appetite accepts, discovered from the scorer", () => {
  const [item] = run({ primary_risk_state: "NY" });
  assert.equal(item.concept, "state");
  assert.equal(item.currentValue, "NY");
  assert.equal(item.requiredValue, "CA");
  assert.equal(item.condition, "Had the primary risk state been CA, CO, FL, GA, MD, NC, OH, PA, SC, UT or VA, it would score 94 and pass.");
  assert.ok(passes(applyPatch({ ...base, primary_risk_state: "NY" }, mapping, { state: item.requiredValue }), "state"));
});

test("TIV over the limit only needs to come down to the limit", () => {
  const row = { ...base, tiv: 200_000_000 };
  const [item] = run({ tiv: 200_000_000 });
  assert.equal(item.concept, "tiv");
  assert.equal(item.status, "outside");
  assert.equal(item.currentValue, 200_000_000);
  assert.equal(item.requiredValue, 150_000_000);
  assert.equal(item.projectedScore, 91);
  assert.equal(item.condition, "If the total insured value were at most $150,000,000, it would score 91 and pass.");
  assertBoundary(item, row, 200_000_000);
});

test("a missing TIV asks for confirmation within the limit", () => {
  const [item] = run({ tiv: 0 });
  assert.equal(item.status, "unknown");
  assert.equal(item.currentValue, null);
  assert.equal(item.requiredValue, 150_000_000);
  assert.equal(item.condition, "If the total insured value were confirmed to be at most $150,000,000, it would score 91 and pass.");
  assert.equal(item.sentence, "This is incomplete at 69/100. If the total insured value were confirmed to be at most $150,000,000, it would score 91 and pass.");
});

test("premium below, above, and missing each name the nearest edge of the band", () => {
  const low = run({ premium: 30_000 })[0];
  assert.equal(low.requiredValue, 50_000);
  assert.equal(low.condition, "If the premium were at least $50,000, it would score 91 and pass.");
  assertBoundary(low, { ...base, premium: 30_000 }, 30_000);
  const high = run({ premium: 200_000 })[0];
  assert.equal(high.requiredValue, 175_000);
  assert.equal(high.condition, "If the premium were at most $175,000, it would score 91 and pass.");
  assertBoundary(high, { ...base, premium: 200_000 }, 200_000);
  const missing = run({ premium: null })[0];
  assert.equal(missing.status, "unknown");
  assert.equal(missing.requiredValue, 50_000);
  assert.equal(missing.condition, "If the premium were confirmed to be between $50,000 and $175,000, it would score 91 and pass.");
});

test("building age is a fact of the risk: the counterfactual is a condition, never an action", () => {
  const row = { ...base, year_built: 1975 };
  const [item] = run({ year_built: 1975 });
  assert.equal(item.concept, "year");
  assert.equal(item.currentValue, 1975);
  assert.equal(item.requiredValue, 1991);
  assert.equal(item.projectedScore, 91);
  assert.equal(item.condition, "Had the oldest building been built in 1991 or later, it would score 91 and pass.");
  assert.doesNotMatch(item.condition, /^If /);
  assertBoundary(item, row, 1975);
});

test("the undefined 1990 boundary and a missing year both ask for confirmation of a post-1990 build", () => {
  for (const year_built of [1990, null, 2030]) {
    const [item] = run({ year_built });
    assert.equal(item.status, "unknown", String(year_built));
    assert.equal(item.requiredValue, 1991);
    assert.equal(item.condition, "If the year built were confirmed to be 1991 or later, it would score 91 and pass.");
  }
});

test("the oldest building governs when a policy has several buildings", () => {
  const n = { type: "number" }, s = { type: "string" };
  const nestedPlan = planQuery({
    Policy: { type: "object", fields: { id: n, premium: n, currency: s, business_type: s, line_of_business: s, account_name: s, effective_date: s, expiration_date: s, exposure_units: { type: "reference", resource: "Exposure", cardinality: "many" } } },
    Exposure: { type: "object", fields: { location: { type: "reference", resource: "Location", cardinality: "one" } } },
    Location: { type: "object", fields: { id: n, state: s, buildings: { type: "reference", resource: "Building", cardinality: "many" } } },
    Building: { type: "object", fields: { id: n, year_built: n, tiv: n, construction_type: s } },
  });
  const building = (id: number, year_built: number) => ({ id, tiv: 30_000_000, year_built, construction_type: "joisted_masonry" });
  const row = { id: 10, premium: 90_000, currency: "USD", business_type: "new", line_of_business: "property", account_name: "Nested Holdings", effective_date: "2026-03-01", expiration_date: "2027-03-01", exposure_units: [{ location: { id: 1, state: "OH", buildings: [building(1, 2015), building(2, 1985)] } }] };
  const derived = deriveFacts(row, nestedPlan, asOf);
  const item = counterfactuals(derived.row, derived.mapping, "id", asOf).find((entry) => entry.concept === "year");
  assert.ok(item);
  assert.equal(item.currentValue, 1985);
  assert.equal(item.requiredValue, 1991);
  const after = scoreSubmission(applyPatch(derived.row, derived.mapping, item.patch), derived.mapping, "id", asOf);
  assert.equal(after.criteria.find((entry) => entry.concept === "year")?.status, "acceptable");
});

test("construction mix below half is actionable and needs only to pass half", () => {
  const row = { ...base, acceptable_construction_percent: 40 };
  const [item] = run({ acceptable_construction_percent: 40 });
  assert.equal(item.concept, "constructionPercent");
  assert.equal(item.currentValue, 40);
  assert.equal(item.requiredValue, 51);
  assert.equal(item.projectedScore, 94);
  assert.equal(item.condition, "If eligible construction were more than 50%, it would score 94 and pass.");
  assertBoundary(item, row, 40);
  const [half] = run({ acceptable_construction_percent: 50 });
  assert.equal(half.status, "unknown");
  assert.equal(half.condition, "If eligible construction were confirmed to be more than 50%, it would score 94 and pass.");
  const [invalid] = run({ acceptable_construction_percent: 101 });
  assert.equal(invalid.currentValue, null);
  assert.equal(invalid.requiredValue, 51);
});

test("loss history is immutable: losses over the limit are a condition on the past", () => {
  const row = { ...base, five_year_loss_value: 250_000 };
  const [item] = run({ five_year_loss_value: 250_000 });
  assert.equal(item.concept, "lossValue");
  assert.equal(item.currentValue, 250_000);
  assert.equal(item.requiredValue, 99_999);
  assert.equal(item.condition, "Had five-year losses been under $100,000, it would score 94 and pass.");
  assertBoundary(item, row, 250_000);
  const [exact] = run({ five_year_loss_value: 100_000 });
  assert.equal(exact.status, "unknown");
  assert.equal(exact.condition, "If five-year losses were confirmed to be under $100,000, it would score 94 and pass.");
  const [missing] = run({ five_year_loss_value: null });
  assert.equal(missing.requiredValue, 99_999);
});

test("with several exceptions, one change alone still leaves the rest and the sentence says so", () => {
  const items = run({ primary_risk_state: "NY", acceptable_construction_percent: 40 });
  assert.deepEqual(items.map((item) => item.concept), ["state", "constructionPercent"]);
  for (const item of items) {
    assert.equal(item.projectedScore, 49);
    assert.equal(item.projectedAction, "Refer for appetite exceptions");
  }
  assert.equal(items[0].condition, "Had the primary risk state been CA, CO, FL, GA, MD, NC, OH, PA, SC, UT or VA, it would score 49 and stay outside appetite on construction mix.");
  assert.equal(items[1].condition, "If eligible construction were more than 50%, it would score 49 and stay outside appetite on primary risk state.");
});

test("an exception next to a gap: fixing the exception leaves the gap to confirm", () => {
  const items = run({ primary_risk_state: "NY", premium: null });
  const state = items.find((item) => item.concept === "state")!;
  assert.equal(state.projectedScore, 69);
  assert.equal(state.projectedAction, "Investigate missing or ambiguous data");
  assert.match(state.condition, /it would score 69, with total premium still to confirm\.$/);
});

test("counterfactuals are sorted by projected gain and capped at three", () => {
  const items = run({ business_type: "renewal", primary_risk_state: "NY", tiv: 200_000_000, premium: null, year_built: 1975 });
  assert.equal(items.length, 3);
  const gains = items.map((item) => item.projectedScore);
  assert.deepEqual(gains, [...gains].sort((a, b) => b - a));
  // Every candidate leaves other exceptions in place, so the gain is the factor's own points: state (15) first, then TIV, premium and year (12 each) in guide order; renewal (8) drops off.
  assert.deepEqual(items.map((item) => item.concept), ["state", "tiv", "premium"]);
});

test("the input row is never mutated and results are deterministic", () => {
  const row = { ...base, tiv: 200_000_000, primary_risk_state: "NY" };
  const snapshot = JSON.stringify(row);
  const first = counterfactuals(row, mapping, "id", asOf);
  const second = counterfactuals(row, mapping, "id", asOf);
  assert.equal(JSON.stringify(row), snapshot);
  assert.deepEqual(first, second);
});

test("garbage rows and mappings degrade to no counterfactuals instead of throwing", () => {
  assert.deepEqual(counterfactuals({ id: 3 }, {}, "id", asOf), []);
  const row = { id: 4, tiv: "lots", premium: { amount: 1 }, year_built: [null, "old"], exposure_units: "n/a" };
  const oddMapping = { ...mapping, year: "exposure_units.location.buildings.year_built" };
  const odd = counterfactuals(row, oddMapping, "id", asOf);
  assert.ok(Array.isArray(odd) && odd.length > 0);
  assert.ok(odd.every((item) => item.projectedScore >= scoreSubmission(row, oddMapping, "id", asOf).score));
});

test("whatIf re-scores a patched copy and reports what moved", () => {
  const row = { ...base, tiv: 200_000_000 };
  const result = whatIf(row, { tiv: 120_000_000 }, { mapping, idPath: "id", asOf });
  assert.equal(result.before.score, 49);
  assert.equal(result.after.score, 91, "$120M is inside the limit but above the target band");
  assert.deepEqual(result.changes, [{ concept: "tiv", factor: "Total insured value", from: "outside", to: "acceptable" }]);
  assert.equal(row.tiv, 200_000_000);
  // Defaults to the case mapping, where each concept is its own column.
  const plain = whatIf({ id: "case", account: "Plain", business: "new", line: "property", state: "CA", tiv: 75_000_000, premium: 85_000, year: 2015, constructionPercent: 75, lossValue: 0, effective: "2026-01-01", expiration: "2027-01-01" }, { state: "NY" });
  assert.equal(plain.before.score, 94);
  assert.equal(plain.after.score, 49);
  assert.deepEqual(plain.changes.map((change) => change.concept), ["state"]);
});

test("applyPatch writes through arrays and creates missing parents without touching the source", () => {
  const row = { id: 1, buildings: [{ year_built: 1970 }, { year_built: 2001 }] };
  const patched = applyPatch(row, { year: "buildings.year_built", tiv: "totals.tiv" }, { year: 1995, tiv: 1_000 });
  assert.deepEqual(patched, { id: 1, buildings: [{ year_built: 1995 }, { year_built: 1995 }], totals: { tiv: 1_000 } });
  assert.deepEqual(row, { id: 1, buildings: [{ year_built: 1970 }, { year_built: 2001 }] });
  assert.deepEqual(applyPatch(row, {}, { tiv: 5 }), row);
});

test("describeCounterfactuals turns the list into one brief-ready clause", () => {
  assert.equal(describeCounterfactuals([]), "");
  const items = run({ acceptable_construction_percent: 40, year_built: 1975 });
  assert.equal(describeCounterfactuals(items), `What would change it: ${items[0].condition} ${items[1].condition}`);
});
