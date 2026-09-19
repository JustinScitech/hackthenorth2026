import { readFileSync } from "node:fs";
import { z } from "zod";
import { planQuery } from "./schema";
import { scoreSubmission, type RankedSubmission } from "./scoring";

const concepts = ["business", "line", "state", "tiv", "premium", "year", "constructionPercent", "lossValue"] as const;
const status = z.enum(["target", "acceptable", "outside", "unknown"]);
const recommendation = z.enum(["Review for acceptance", "Refer for appetite exceptions", "Investigate missing or ambiguous data"]);
const expected = z.object({
  recommendation,
  score: z.number().int().min(0).max(100),
  statuses: z.partialRecord(z.enum(concepts), status),
  missingIncludes: z.array(z.string()).optional(),
});
const corpusSchema = z.object({
  schemaVersion: z.literal(1),
  guidelineVersion: z.string().min(1),
  asOf: z.iso.datetime(),
  source: z.object({ title: z.string().min(1), location: z.string().min(1) }),
  base: z.record(z.string(), z.unknown()),
  baseExpected: expected,
  cases: z.array(z.object({
    id: z.string().min(1),
    rule: z.string().min(1),
    source: z.object({ title: z.string().min(1), location: z.string().min(1) }).optional(),
    patch: z.record(z.string(), z.unknown()),
    expected,
  })).min(1),
});

export const underwritingEvaluationCorpus = corpusSchema.parse(JSON.parse(readFileSync(new URL("../../evals/underwriting-appetite.json", import.meta.url), "utf8")));
if (new Set(underwritingEvaluationCorpus.cases.map((item) => item.id)).size !== underwritingEvaluationCorpus.cases.length) {
  throw new Error("Underwriting evaluation IDs must be unique.");
}

const fields = {
  id: { type: "number" }, account_name: { type: "string" }, primary_risk_state: { type: "string" }, business_type: { type: "string" }, line_of_business: { type: "string" },
  tiv: { type: "number" }, premium: { type: "number" }, year_built: { type: "number" }, acceptable_construction_percent: { type: "number" }, five_year_loss_value: { type: "number" }, effective_date: { type: "string" }, expiration_date: { type: "string" },
};
const plan = planQuery({ Policy: { type: "object", fields } });

export type EvaluationResult = { id: string; rule: string; source: typeof underwritingEvaluationCorpus.source; result: RankedSubmission; failures: string[]; passed: boolean };

export function runUnderwritingEvaluation(asOf = new Date(underwritingEvaluationCorpus.asOf)): EvaluationResult[] {
  const { base, baseExpected } = underwritingEvaluationCorpus;
  return underwritingEvaluationCorpus.cases.map((item, index) => {
    const result = scoreSubmission({ ...base, id: index + 1, ...item.patch }, plan.mapping, "id", asOf);
    const failures: string[] = [];
    if (result.recommendation !== item.expected.recommendation) failures.push(`recommendation: expected ${item.expected.recommendation}, got ${result.recommendation}`);
    if (result.score !== item.expected.score) failures.push(`score: expected ${item.expected.score}, got ${result.score}`);
    const statuses = { ...baseExpected.statuses, ...item.expected.statuses };
    for (const concept of concepts) {
      const actual = result.criteria.find((criterion) => criterion.concept === concept)?.status;
      if (!statuses[concept]) failures.push(`${concept}: no expected status in corpus`);
      else if (actual !== statuses[concept]) failures.push(`${concept}: expected ${statuses[concept]}, got ${actual}`);
    }
    for (const missing of item.expected.missingIncludes ?? []) {
      if (!result.missingData.includes(missing)) failures.push(`missing data did not include ${missing}`);
    }
    if (result.criteria.length !== concepts.length) failures.push(`expected ${concepts.length} criteria, got ${result.criteria.length}`);
    if (result.criteria.some((criterion) => !criterion.source || !criterion.detail)) failures.push("criterion lacks source or explanation");
    return { id: item.id, rule: item.rule, source: item.source ?? underwritingEvaluationCorpus.source, result, failures, passed: failures.length === 0 };
  });
}
