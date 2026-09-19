import { planQuery } from "./schema";
import { scoreSubmission, type RankedSubmission } from "./scoring";

const fields = {
  id: { type: "number" }, account_name: { type: "string" }, primary_risk_state: { type: "string" }, business_type: { type: "string" }, line_of_business: { type: "string" },
  tiv: { type: "number" }, premium: { type: "number" }, year_built: { type: "number" }, acceptable_construction_percent: { type: "number" }, five_year_loss_value: { type: "number" }, effective_date: { type: "string" }, expiration_date: { type: "string" },
};
const plan = planQuery({ Policy: { type: "object", fields } });
const base = { account_name: "Evaluation property", primary_risk_state: "CA", business_type: "new", line_of_business: "property", tiv: 75_000_000, premium: 85_000, year_built: 2015, acceptable_construction_percent: 75, five_year_loss_value: 0, effective_date: "2026-01-01", expiration_date: "2027-01-01" };

export const underwritingEvaluationCases = [
  { name: "target renewal", row: { ...base, id: 1, business_type: "renewal" }, expected: "Review for acceptance" },
  { name: "out of appetite state", row: { ...base, id: 2, primary_risk_state: "NY" }, expected: "Refer for appetite exceptions" },
  { name: "missing premium", row: { ...base, id: 3, premium: null }, expected: "Investigate missing or ambiguous data" },
  { name: "loss threshold boundary", row: { ...base, id: 4, five_year_loss_value: 100_000 }, expected: "Investigate missing or ambiguous data" },
  { name: "oldest building exception", row: { ...base, id: 5, year_built: 1989 }, expected: "Refer for appetite exceptions" },
] as const;

export function runUnderwritingEvaluation(asOf = new Date("2026-09-19T00:00:00Z")): { name: string; result: RankedSubmission; expected: string; passed: boolean }[] {
  return underwritingEvaluationCases.map((item) => {
    const result = scoreSubmission(item.row, plan.mapping, "id", asOf);
    return { name: item.name, result, expected: item.expected, passed: result.recommendation === item.expected };
  });
}
