import assert from "node:assert/strict";
import test from "node:test";
import { brokerAppetite } from "../lib/case-appetite";
import { caseFromSubmission } from "./open-case";
import { planQuery } from "./schema";
import { scoreSubmission } from "./scoring";

const fields = {
  id: { type: "number" }, account_name: { type: "string" }, primary_risk_state: { type: "string" }, business_type: { type: "string" }, line_of_business: { type: "string" },
  tiv: { type: "number" }, premium: { type: "number" }, year_built: { type: "number" }, acceptable_construction_percent: { type: "number" }, five_year_loss_value: { type: "number" }, effective_date: { type: "string" }, expiration_date: { type: "string" },
};
const plan = planQuery({ Submission: { type: "object", fields } });
const good = { id: 81, account_name: "Coastal Freight Systems LLC", primary_risk_state: "CA", business_type: "New_Business", line_of_business: "property", tiv: 75_000_000, premium: 85_000, year_built: 2015, acceptable_construction_percent: 75, five_year_loss_value: null, effective_date: "2026-01-01", expiration_date: "2027-01-01" };
const context = { resource: "Submission", rank: 1, of: 158, rankedAt: "2026-09-20T03:06:45.320Z" };

test("verified facts become intake evidence and open answers stay blank", () => {
  const item = { ...scoreSubmission(good, plan.mapping), lifecycleStatus: "received", evidenceNote: "Evidence supplemented from uniquely linked Policy 12." };
  const draft = caseFromSubmission(item, context);
  assert.equal(draft.insuredName, "Coastal Freight Systems LLC");
  assert.equal(draft.state, "CA");
  assert.equal(draft.tiv, 75_000_000);
  assert.equal(draft.yearBuilt, 2015);
  assert.equal(draft.losses, null);
  assert.deepEqual(draft.appetite, { business: "new", line: "property", premium: 85_000, constructionPercent: 75, lossValue: null, lossHistoryComplete: false, effective: "2026-01-01", expiration: "2027-01-01" });
  assert.deepEqual(draft.origin, { system: "federato", resource: "Submission", id: "81", rank: 1, of: 158, rankedAt: context.rankedAt, lifecycleStatus: "received", evidenceNote: item.evidenceNote });
  assert.match(draft.brokerNotes, /^Federato Submission 81: Coastal Freight Systems LLC\. Ranked 1 of 158/);
  assert.match(draft.brokerNotes, /Appetite read at intake: Needs information\./);
  assert.match(draft.brokerNotes, /Open answers: five-year loss value \(five-year loss runs from the broker\)/);
  assert.match(draft.brokerNotes, /- Primary risk state: CA is a target state\. Source: primary_risk_state\./);
});

test("the labelled lines in the notes parse back into the same appetite evidence", () => {
  const draft = caseFromSubmission(scoreSubmission(good, plan.mapping), context);
  const parsed = brokerAppetite(draft.brokerNotes);
  assert.equal(parsed.business, "new");
  assert.equal(parsed.premium, 85_000);
  assert.equal(parsed.constructionPercent, 75);
  assert.equal(parsed.lossHistoryComplete, false);
  assert.equal(parsed.effective, "2026-01-01");
  assert.equal("lossValue" in parsed, false);
});

test("a submission with unresolved state and TIV still opens, with both left for the broker", () => {
  const draft = caseFromSubmission(scoreSubmission({ ...good, primary_risk_state: null, tiv: null, account_name: " " }, plan.mapping), context);
  assert.equal(draft.state, null);
  assert.equal(draft.tiv, null);
  assert.equal(draft.insuredName, "Federato Submission 81");
});

test("a direct five-year loss figure under the limit counts as complete history", () => {
  const draft = caseFromSubmission(scoreSubmission({ ...good, five_year_loss_value: 12_000 }, plan.mapping), context);
  assert.equal(draft.appetite.lossValue, 12_000);
  assert.equal(draft.appetite.lossHistoryComplete, true);
  assert.match(draft.brokerNotes, /Five-year history complete: yes/);
});
