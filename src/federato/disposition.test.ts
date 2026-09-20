import assert from "node:assert/strict";
import test from "node:test";
import { classify, factorPhrase, money, nextStep } from "./disposition";
import { planQuery } from "./schema";
import { scoreSubmission } from "./scoring";

const fields = {
  id: { type: "number" }, account_name: { type: "string" }, primary_risk_state: { type: "string" }, business_type: { type: "string" }, line_of_business: { type: "string" },
  tiv: { type: "number" }, premium: { type: "number" }, year_built: { type: "number" }, acceptable_construction_percent: { type: "number" }, five_year_loss_value: { type: "number" }, effective_date: { type: "string" }, expiration_date: { type: "string" },
};
const plan = planQuery({ Policy: { type: "object", fields } });
const good = { id: 1, account_name: "Harbor Logistics", primary_risk_state: "CA", business_type: "new", line_of_business: "property", tiv: 75_000_000, premium: 85_000, year_built: 2015, acceptable_construction_percent: 75, five_year_loss_value: 0, effective_date: "2026-01-01", expiration_date: "2027-01-01" };
const score = (changes: Record<string, unknown> = {}) => scoreSubmission({ ...good, ...changes }, plan.mapping);

test("a submission in every target band is a Target with the target factors as its reason", () => {
  const result = score();
  assert.equal(result.disposition, "Target");
  assert.deepEqual(result.determining, ["Primary risk state", "Total insured value", "Total premium", "Building age"]);
  const step = nextStep(result);
  assert.equal(step.action, "Prioritize for quote.");
  assert.match(step.why, /\$75M TIV sits in the \$50M to \$100M target band/);
  assert.deepEqual(step.questions, []);
});

test("acceptable factors outside the target band make it Acceptable and name what held it back", () => {
  const result = score({ primary_risk_state: "GA", tiv: 120_000_000 });
  assert.equal(result.disposition, "Acceptable");
  assert.deepEqual(result.determining, ["Primary risk state", "Total insured value"]);
  const step = nextStep(result);
  assert.match(step.why, /GA is an acceptable state and \$120M TIV is inside the \$150M limit; those keep it out of the target band/);
  assert.equal(step.action, "Review for acceptance.");
});

test("open answers make it Needs information and say what it becomes once they land", () => {
  const result = score({ five_year_loss_value: null, premium: null });
  assert.equal(result.disposition, "Needs information");
  assert.deepEqual(result.determining, ["Total premium", "Five-year loss value"]);
  assert.equal(result.ifResolved, "Target");
  const step = nextStep(result);
  assert.match(step.why, /Fits appetite on 6 of 8 factors/);
  assert.match(step.why, /2 answers decide it: total premium and five-year loss value/);
  assert.match(step.action, /this becomes Target/);
  assert.deepEqual(step.questions.map((question) => question.item), ["Total premium", "Five-year loss value"]);
  assert.match(step.questions[1].source, /loss runs from the broker/);
});

test("an open answer next to an acceptable factor resolves to Acceptable", () => {
  const result = score({ primary_risk_state: "UT", year_built: null });
  assert.equal(result.disposition, "Needs information");
  assert.equal(result.ifResolved, "Acceptable");
  assert.match(nextStep(result).why, /One answer decides it: building age/);
});

test("required account context counts as an open answer", () => {
  const result = score({ effective_date: null });
  assert.equal(result.disposition, "Needs information");
  assert.deepEqual(result.determining, ["effective date"]);
  assert.equal(nextStep(result).questions[0].source, "the broker");
});

test("an exception makes it Outside appetite whatever else is open", () => {
  const result = score({ year_built: 1978, five_year_loss_value: null });
  assert.equal(result.disposition, "Outside appetite");
  assert.deepEqual(result.determining, ["Building age"]);
  const step = nextStep(result);
  assert.match(step.why, /Outside appetite on building age: oldest building 1978, older than 1990/);
  assert.match(step.action, /exception request/);
  assert.match(step.action, /five-year loss value would also need confirming/);
});

test("factor phrases quote the observed figures", () => {
  const result = score({ premium: 45_000, tiv: 160_000_000, primary_risk_state: "NY", business_type: "renewal", line_of_business: "auto", acceptable_construction_percent: 40, five_year_loss_value: 180_000 });
  const phrases = result.criteria.map((criterion) => factorPhrase(criterion, result.facts));
  assert.deepEqual(phrases, [
    "renewal business, which the guideline lists as unacceptable",
    "auto line, and the appetite covers property only",
    "NY is outside the accepted states",
    "$160M TIV is over the $150M limit",
    "$45K premium is under the $50K minimum",
    "oldest building 2015, newer than 2010",
    "40% eligible construction, under the 50% minimum",
    "$180K five-year losses, over the $100K limit",
  ]);
});

test("boundary values and claim lower bounds are explained as such", () => {
  const boundary = score({ year_built: 1990, acceptable_construction_percent: 50, five_year_loss_value: 100_000 });
  const phrase = (factor: string) => factorPhrase(boundary.criteria.find((criterion) => criterion.factor === factor)!, boundary.facts);
  assert.equal(phrase("Building age"), "a 1990 building sits on the guideline boundary");
  assert.equal(phrase("Construction mix"), "50% eligible construction sits on the guideline boundary");
  assert.equal(phrase("Five-year loss value"), "$100K five-year losses sit on the guideline boundary");
  const partial = score({ five_year_loss_value: null });
  partial.facts!.lossLowerBound = 42_000;
  assert.equal(factorPhrase(partial.criteria.find((criterion) => criterion.factor === "Five-year loss value")!, partial.facts), "five-year loss dollars unconfirmed; linked claims show at least $42K");
});

test("classification works from criteria alone, as stored case results have them", () => {
  const { criteria, missingData } = score({ premium: null });
  assert.equal(classify({ criteria, missingData }).disposition, "Needs information");
  assert.equal(money(1_250_000), "$1.3M");
  assert.equal(money(85_000), "$85K");
  assert.equal(money(950), "$950");
});

test("many open answers are summarised rather than listed in the line", () => {
  const result = score({ primary_risk_state: null, tiv: null, premium: null, year_built: null, acceptable_construction_percent: null });
  const step = nextStep(result);
  assert.match(step.why, /5 answers decide it, starting with primary risk state and total insured value\./);
  assert.match(step.action, /^Get all 5 open answers\. With those answers inside appetite this becomes Target\.$/);
  assert.equal(step.questions.length, 5);
});
