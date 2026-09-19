import { buildFacts, evaluateFacts, type Extracted, type Intake } from "../src/agent/analysis";
import { extractNotes } from "../src/agent/model";
import { randomUUID } from "node:crypto";
import { initMonitoring, recordEvalRun, startAgentSpan, type EvalCaseResult } from "../src/agent/monitoring";

type Fixture = {
  name: string;
  notes: string;
  expected: Extracted;
  intake: Intake;
  expectedReferrals: number;
  needsBroker: boolean;
};

const fixtures: Fixture[] = [
  {
    name: "clear submission",
    notes: "Commercial property submission for Harbor Office LLC. The main building was constructed in 2005 and had no losses in the past three years.",
    expected: { yearBuilt: 2005, losses: 0 },
    intake: { state: "NY", tiv: 2_400_000, yearBuilt: null, losses: null },
    expectedReferrals: 0,
    needsBroker: false,
  },
  {
    name: "property schedule and loss run",
    notes: `Broker submission for Ridgeway Distribution LLC, a single-location commercial property risk in New Jersey.
Operations: The insured stores packaged consumer goods for regional retailers. The tenant occupies the entire warehouse and operates two shifts. Forklift charging is confined to a marked room. The broker reports no manufacturing or hazardous chemical storage. The requested effective date is October 1, 2026. The submission includes a property schedule, a loss summary, and a note about planned capital improvements.
Property schedule: The warehouse at 125 Wellington Road was originally built in 1988. It has masonry exterior walls and a steel frame. The roof was replaced in 2019 and the sprinkler system was upgraded in 2022; neither date is the original construction year. The schedule of values lists a building value of $3.1 million and business personal property of $1.2 million. The tenant occupies the entire building. A 2025 appraisal changed the replacement-cost estimate but did not change the construction date. The broker asks the underwriter to verify the sprinkler certificate and roof warranty.
Loss summary: The attached loss run describes three claims in the past three years: a 2024 water damage claim, a 2025 small fire claim, and a 2026 wind claim. The water damage followed a broken pipe; the fire was confined to one loading area; and the wind claim concerns roof flashing. A separate 2017 hail claim is outside the three-year period. The broker is still obtaining final paid amounts and requests human review of the loss history. This summary describes claim count only; it does not establish the total incurred amount or a complete five-year loss history.
Open items: The broker will provide updated photographs, a current statement of values, and the final loss runs. The insured expects the roof work to finish before inception, but the underwriter has not verified it.`,
    expected: { yearBuilt: 1988, losses: 3 },
    intake: { state: "NJ", tiv: 4_300_000, yearBuilt: null, losses: null },
    expectedReferrals: 1,
    needsBroker: false,
  },
  {
    name: "missing construction and losses",
    notes: "Commercial property submission for Canal Street Kitchen. The construction year is pending confirmation from the landlord. The broker requested loss runs but has not supplied a recent claim count.",
    expected: { yearBuilt: null, losses: null },
    intake: { state: "NY", tiv: 1_750_000, yearBuilt: null, losses: null },
    expectedReferrals: 0,
    needsBroker: true,
  },
  {
    name: "broker correction supersedes intake",
    notes: `Initial broker note: The property was built in 1972 and had 4 losses in the past three years.
--- BROKER UPDATE ---
Correction from the broker: The property was constructed in 2004. There was one loss in the past three years. The earlier construction year and loss count were entered for a different location.`,
    expected: { yearBuilt: 2004, losses: 1 },
    intake: { state: "PA", tiv: 3_200_000, yearBuilt: null, losses: null },
    expectedReferrals: 0,
    needsBroker: false,
  },
];

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for the live agent eval");
  delete process.env.OPENAI_API_KEY;
  initMonitoring("eval");
  const startedAt = Date.now();
  let passed = 0;
  let lastModel: string | null = null;
  const cases: EvalCaseResult[] = [];
  await startAgentSpan("underwriting.eval", "agent.eval", { fixtures: fixtures.length }, async () => {
  for (const [index, fixture] of fixtures.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 12_000));
    const caseStartedAt = Date.now();
    const result = await startAgentSpan(`underwriting.eval.${fixture.name}`, "agent.eval.case", { fixture: fixture.name }, () => extractNotes(fixture.notes));
    const geminiAttempts = result.attempts.filter((attempt) => attempt.source === "Gemini");
    const gemini = geminiAttempts.find((attempt) => attempt.status === "completed");
    if (gemini) lastModel = gemini.model;
    const modelCorrect = gemini?.status === "completed"
      && gemini.value?.yearBuilt === fixture.expected.yearBuilt
      && gemini.value?.losses === fixture.expected.losses;
    const provenanceCorrect = (fixture.expected.yearBuilt === null || result.fieldSources.yearBuilt === `Gemini ${gemini?.model}`)
      && (fixture.expected.losses === null || result.fieldSources.losses === `Gemini ${gemini?.model}`);
    const checks = evaluateFacts(buildFacts(fixture.intake, result.extracted));
    const guidelineCorrect = checks.findings.filter((finding) => finding.result === "refer").length === fixture.expectedReferrals
      && Boolean(checks.question) === fixture.needsBroker;
    const ok = Boolean(modelCorrect && provenanceCorrect && guidelineCorrect);
    if (ok) passed++;
    cases.push({ name: fixture.name, ok, durationMs: Date.now() - caseStartedAt, model: gemini?.model ?? null });
    console.log(`${ok ? "PASS" : "FAIL"} ${fixture.name}: ${geminiAttempts.map((attempt) => `${attempt.model} ${attempt.status}${attempt.errorCode ? ` (HTTP ${attempt.errorCode})` : ""}`).join(" -> ")}, selected ${gemini?.model ?? "none"} ${gemini?.durationMs ?? 0}ms, extracted ${JSON.stringify(gemini?.value ?? null)}, expected ${JSON.stringify(fixture.expected)}`);
    if (!guidelineCorrect) console.log(`  Guideline result: ${checks.findings.filter((finding) => finding.result === "refer").length} referrals, broker question ${Boolean(checks.question)}`);
    if (!provenanceCorrect) console.log(`  Extraction sources: ${JSON.stringify(result.fieldSources)}`);
  }
  });
  console.log(`${passed}/${fixtures.length} live Gemini evals passed`);
  if (process.env.DATABASE_URL) {
    const { db } = await import("../src/lib/db");
    try {
      await db.query("INSERT INTO agent_eval_runs (id, total, passed, duration_ms, model) VALUES ($1, $2, $3, $4, $5)",
        [randomUUID(), fixtures.length, passed, Date.now() - startedAt, lastModel]);
    } finally {
      await db.end();
    }
  }
  await recordEvalRun({ passed, total: fixtures.length, durationMs: Date.now() - startedAt, model: lastModel, cases });
  if (passed !== fixtures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
