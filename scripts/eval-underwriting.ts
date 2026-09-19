import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runUnderwritingEvaluation, underwritingEvaluationCorpus } from "../src/federato/evaluation";

const results = runUnderwritingEvaluation();
const passed = results.filter((item) => item.passed).length;
const report = {
  schemaVersion: 1,
  guidelineVersion: underwritingEvaluationCorpus.guidelineVersion,
  source: underwritingEvaluationCorpus.source,
  asOf: underwritingEvaluationCorpus.asOf,
  total: results.length,
  passed,
  cases: results.map(({ id, rule, source, result, failures, passed }) => ({ id, rule, source, passed, failures, recommendation: result.recommendation, score: result.score, criteria: result.criteria, missingData: result.missingData })),
};
const path = resolve("data/underwriting-eval-report.json");
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
for (const item of results) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.id}${item.failures.length ? `: ${item.failures.join("; ")}` : ""}`);
console.log(`${passed}/${results.length} underwriting cases passed; report: ${path}`);
if (passed !== results.length) process.exitCode = 1;
