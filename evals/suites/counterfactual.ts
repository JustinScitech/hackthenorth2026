import { applyPatch, counterfactuals, whatIf } from "../../src/federato/counterfactual";
import { planQuery } from "../../src/federato/schema";
import { scoreSubmission, type Criterion } from "../../src/federato/scoring";
import { attempt, type CaseResult, type Suite } from "../runner";

/**
 * "What would change it" counterfactuals over the Federato appetite. Every
 * case pins the invariants an underwriter relies on: a suggested change never
 * lowers the score, the patch really flips the named factor when re-scored,
 * a case already inside appetite gets no suggestions, and no sentence talks
 * about a factor that already passes. The thresholds are never written here:
 * the required value must be the exact edge the live scorer accepts.
 */
const asOf = new Date("2026-09-19T00:00:00Z");
const fields = {
  id: { type: "number" }, account_name: { type: "string" }, primary_risk_state: { type: "string" }, business_type: { type: "string" }, line_of_business: { type: "string" },
  tiv: { type: "number" }, premium: { type: "number" }, year_built: { type: "number" }, acceptable_construction_percent: { type: "number" }, five_year_loss_value: { type: "number" }, effective_date: { type: "string" }, expiration_date: { type: "string" },
};
const { mapping } = planQuery({ Policy: { type: "object", fields } });
const base = { id: 1, account_name: "Evaluation property", primary_risk_state: "CA", business_type: "new", line_of_business: "property", tiv: 75_000_000, premium: 85_000, year_built: 2015, acceptable_construction_percent: 75, five_year_loss_value: 0, effective_date: "2026-01-01", expiration_date: "2027-01-01" };

/** Words each factor's sentence uses, so a sentence about a passing factor is caught even though the prose does not repeat the factor label. */
const mentions: Record<Criterion["concept"], string[]> = {
  business: ["submission type", "new business", "renewal"], line: ["line of business", "property"], state: ["risk state"], tiv: ["insured value"],
  premium: ["premium"], year: ["built", "building"], constructionPercent: ["construction"], lossValue: ["loss"], account: [], effective: [], expiration: [],
};
const immutable = new Set<Criterion["concept"]>(["business", "line", "state", "year", "lossValue"]);

type Case = { name: string; row: Record<string, unknown>; expectConcepts: Criterion["concept"][]; note?: string };
const cases: Case[] = [
  { name: "in-appetite submission has no counterfactuals", row: base, expectConcepts: [] },
  { name: "acceptable-tier matches are not treated as gaps", row: { ...base, primary_risk_state: "GA", tiv: 20_000_000, year_built: 2005, acceptable_construction_percent: 51 }, expectConcepts: [] },
  { name: "renewal business", row: { ...base, business_type: "renewal" }, expectConcepts: ["business"] },
  { name: "non-property line", row: { ...base, line_of_business: "General Liability" }, expectConcepts: ["line"] },
  { name: "out-of-appetite state", row: { ...base, primary_risk_state: "NY" }, expectConcepts: ["state"] },
  { name: "TIV over the limit", row: { ...base, tiv: 200_000_000 }, expectConcepts: ["tiv"] },
  { name: "missing TIV", row: { ...base, tiv: 0 }, expectConcepts: ["tiv"] },
  { name: "premium under the band", row: { ...base, premium: 30_000 }, expectConcepts: ["premium"] },
  { name: "premium over the band", row: { ...base, premium: 200_000 }, expectConcepts: ["premium"] },
  { name: "missing premium", row: { ...base, premium: null }, expectConcepts: ["premium"] },
  { name: "pre-1990 building", row: { ...base, year_built: 1975 }, expectConcepts: ["year"] },
  { name: "building from exactly 1990", row: { ...base, year_built: 1990 }, expectConcepts: ["year"] },
  { name: "missing year", row: { ...base, year_built: null }, expectConcepts: ["year"] },
  { name: "construction mix below half", row: { ...base, acceptable_construction_percent: 40 }, expectConcepts: ["constructionPercent"] },
  { name: "construction mix of exactly half", row: { ...base, acceptable_construction_percent: 50 }, expectConcepts: ["constructionPercent"] },
  { name: "losses over the limit", row: { ...base, five_year_loss_value: 250_000 }, expectConcepts: ["lossValue"] },
  { name: "losses of exactly the limit", row: { ...base, five_year_loss_value: 100_000 }, expectConcepts: ["lossValue"] },
  { name: "two exceptions: each change alone leaves the other", row: { ...base, primary_risk_state: "NY", acceptable_construction_percent: 40 }, expectConcepts: ["state", "constructionPercent"], note: "A single change cannot bring this inside appetite, and the sentence must say what remains." },
  { name: "exception beside a gap", row: { ...base, primary_risk_state: "NY", premium: null }, expectConcepts: ["state", "premium"] },
  { name: "five problems are capped at the three biggest gains", row: { ...base, business_type: "renewal", primary_risk_state: "NY", tiv: 200_000_000, premium: null, year_built: 1975 }, expectConcepts: ["state", "tiv", "premium"] },
  { name: "missing account context alone suggests nothing", row: { ...base, account_name: "" }, expectConcepts: [], note: "The account name is required context, not an appetite factor; there is no score to project." },
];

function check(item: Case): CaseResult {
  return attempt(item.name, () => {
    const problems: string[] = [];
    const before = scoreSubmission(item.row, mapping, "id", asOf);
    const statusOf = (result: typeof before, concept: string) => result.criteria.find((criterion) => criterion.concept === concept)?.status;
    const items = counterfactuals(item.row, mapping, "id", asOf);
    if (items.map((entry) => entry.concept).join(",") !== item.expectConcepts.join(",")) problems.push(`concepts ${items.map((entry) => entry.concept).join(",") || "none"} expected ${item.expectConcepts.join(",") || "none"}`);
    if (before.recommendation === "Review for acceptance" && items.length) problems.push("a passing case must not get counterfactuals");
    if (items.length > 3) problems.push(`${items.length} counterfactuals exceed the cap of three`);
    const passing = before.criteria.filter((criterion) => criterion.status === "target" || criterion.status === "acceptable");
    let previousGain = Number.POSITIVE_INFINITY;
    for (const entry of items) {
      const status = statusOf(before, entry.concept);
      if (status !== "outside" && status !== "unknown") problems.push(`${entry.factor} is ${status}, not a gap`);
      if (entry.status !== status) problems.push(`${entry.factor} reports status ${entry.status}, scorer says ${status}`);
      if (entry.projectedScore < before.score) problems.push(`${entry.factor} projects ${entry.projectedScore} below the current ${before.score}`);
      const gain = entry.projectedScore - before.score;
      if (gain > previousGain) problems.push(`${entry.factor} gain ${gain} is out of order`);
      previousGain = gain;
      const after = scoreSubmission(applyPatch(item.row, mapping, entry.patch), mapping, "id", asOf);
      const flipped = statusOf(after, entry.concept);
      if (flipped !== "target" && flipped !== "acceptable") problems.push(`${entry.factor}: re-scoring with ${JSON.stringify(entry.patch)} leaves it ${flipped}`);
      if (after.score !== entry.projectedScore) problems.push(`${entry.factor}: projected ${entry.projectedScore} but re-scoring gives ${after.score}`);
      if (after.recommendation !== entry.projectedAction) problems.push(`${entry.factor}: projected action ${entry.projectedAction} but re-scoring gives ${after.recommendation}`);
      const replay = whatIf(item.row, entry.patch, { mapping, idPath: "id", asOf });
      if (replay.after.score !== entry.projectedScore || !replay.changes.some((change) => change.concept === entry.concept)) problems.push(`${entry.factor}: whatIf disagrees with the counterfactual`);
      for (const text of [entry.sentence, entry.condition]) {
        const lower = text.toLowerCase();
        for (const criterion of passing) for (const word of mentions[criterion.concept]) if (lower.includes(word)) problems.push(`${entry.factor}: "${text}" mentions passing factor ${criterion.factor} via "${word}"`);
        if (!lower.includes(`score ${entry.projectedScore}`)) problems.push(`${entry.factor}: "${text}" does not state the projected score`);
      }
      if (!entry.sentence.startsWith(`This is ${before.criteria.some((criterion) => criterion.status === "outside") ? "outside appetite" : "incomplete"} at ${before.score}/100. `)) problems.push(`${entry.factor}: sentence "${entry.sentence}" does not open with the current standing`);
      if (entry.status === "outside" && immutable.has(entry.concept) && !entry.condition.startsWith("Had ")) problems.push(`${entry.factor}: an immutable fact must read as a condition, got "${entry.condition}"`);
      if (entry.status === "outside" && !immutable.has(entry.concept) && !entry.condition.startsWith("If ")) problems.push(`${entry.factor}: an actionable factor should read as a possibility, got "${entry.condition}"`);
      if (entry.status === "unknown" && !entry.condition.includes("confirmed")) problems.push(`${entry.factor}: a gap should ask for confirmation, got "${entry.condition}"`);
      if (entry.projectedAction === "Review for acceptance" && !entry.condition.endsWith(" and pass.")) problems.push(`${entry.factor}: a change that clears the case must end with "and pass."`);
      if (entry.projectedAction === "Refer for appetite exceptions" && !entry.condition.includes("stay outside appetite on ")) problems.push(`${entry.factor}: a change that leaves exceptions must say which remain`);
      if (typeof entry.requiredValue === "number") {
        // The required value must sit on the edge the scorer accepts: from a known value, one step back toward it fails; from a gap, a neighbour on at least one side fails.
        const neighbour = (value: number) => ["target", "acceptable"].includes(statusOf(scoreSubmission(applyPatch(item.row, mapping, { [entry.concept]: value }), mapping, "id", asOf), entry.concept) ?? "");
        const current = typeof entry.currentValue === "number" ? entry.currentValue : null;
        if (current !== null && neighbour(current < entry.requiredValue ? entry.requiredValue - 1 : entry.requiredValue + 1)) problems.push(`${entry.factor}: a value nearer ${current} than ${entry.requiredValue} also passes, so it is not the smallest change`);
        if (current === null && neighbour(entry.requiredValue - 1) && neighbour(entry.requiredValue + 1)) problems.push(`${entry.factor}: ${entry.requiredValue} is inside the band, not on its edge`);
      }
    }
    if (JSON.stringify(scoreSubmission(item.row, mapping, "id", asOf)) !== JSON.stringify(before)) problems.push("computing counterfactuals changed the row");
    return problems;
  }, item.note);
}

export const counterfactualSuite: Suite = {
  name: "counterfactual",
  description: "What would change it: smallest single-factor change per gap, verified by re-scoring, silent on passing factors",
  async run() {
    return cases.map(check);
  },
};
