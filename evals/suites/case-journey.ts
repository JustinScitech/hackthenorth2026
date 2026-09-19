import { BROKER_UPDATE_SEPARATOR, buildFacts, evaluateFacts, parseBrokerNotes, type Intake } from "../../src/agent/analysis";
import type { CaseStatus } from "../../src/lib/types";
import { same, type CaseResult, type Suite } from "../runner";

/**
 * Whole-case journeys through the durable workflow, run in process. Each broker
 * reply starts a new analysis revision over the accumulated text, exactly as the
 * worker joins the original submission with processed replies. Expected values
 * are the status the case should reach after each revision and the facts the
 * underwriter should finally see.
 */
type Revision = { status: Extract<CaseStatus, "waiting_for_broker" | "review_ready">; referrals?: number; question?: string | null };
type Case = { name: string; intake: Intake; submission: string; replies: string[]; expected: Revision[]; finalFacts?: { yearBuilt: number | null; losses: number | null }; note?: string };

const intake = (overrides: Partial<Intake> = {}): Intake => ({ state: "NY", tiv: 1_750_000, yearBuilt: null, losses: null, ...overrides });

export const journeyCases: Case[] = [
  {
    name: "restaurant pauses for the broker then becomes review ready",
    intake: intake(),
    submission: "Commercial property submission for Canal Street Kitchen in New York. The restaurant occupies a single leased building. The broker has not yet supplied the construction year or recent loss history.",
    replies: ["The restaurant building was constructed in 2001. No losses in the past three years."],
    expected: [{ status: "waiting_for_broker", question: "Please provide the year built and number of losses in the past three years for this property." }, { status: "review_ready", referrals: 0, question: null }],
    finalFacts: { yearBuilt: 2001, losses: 0 },
  },
  {
    name: "partial reply keeps the case waiting for the remaining fact",
    intake: intake(),
    submission: "Submission for a leased retail unit. Construction year and loss runs to follow.",
    replies: ["Loss runs attached: no claims in the past three years.", "The building was constructed in 1978."],
    expected: [{ status: "waiting_for_broker" }, { status: "waiting_for_broker", question: "Please provide the year built for this property." }, { status: "review_ready", referrals: 1 }],
    finalFacts: { yearBuilt: 1978, losses: 0 },
    note: "Two follow-ups are needed; the second reply reveals a pre-1980 building, which is referred rather than approved.",
  },
  {
    name: "reply that corrects an earlier fact supersedes it",
    intake: intake({ state: "PA", tiv: 3_200_000 }),
    submission: "Initial broker note: The property was built in 1972. Loss history to follow.",
    replies: ["Correction: the property was constructed in 2004, the 1972 date belonged to a different location. No claims in the past three years."],
    expected: [{ status: "waiting_for_broker", question: "Please provide the number of losses in the past three years for this property." }, { status: "review_ready", referrals: 0 }],
    finalFacts: { yearBuilt: 2004, losses: 0 },
  },
  {
    name: "complete intake goes straight to review with referrals",
    intake: intake({ state: "NJ", tiv: 6_800_000, yearBuilt: 1974, losses: 1 }),
    submission: "Commercial property submission for Garden State Distribution in New Jersey. The warehouse was built in 1974, has $6.8 million in total insured value, and reported one loss in the past three years.",
    replies: [],
    expected: [{ status: "review_ready", referrals: 2, question: null }],
    finalFacts: { yearBuilt: 1974, losses: 1 },
  },
  {
    name: "reply with a dollar amount instead of a count keeps waiting",
    intake: intake({ yearBuilt: 2010 }),
    submission: "Submission for a single-tenant office. Loss history to follow.",
    replies: ["Loss history: $8,500 paid over the period."],
    expected: [{ status: "waiting_for_broker" }, { status: "waiting_for_broker", question: "Please provide the number of losses in the past three years for this property." }],
    finalFacts: { yearBuilt: 2010, losses: null },
    note: "A dollar figure must not be read as a claim count; the agent should keep asking.",
  },
];

export const journeySuite: Suite = {
  name: "case-journey",
  description: "Multi-revision case flow: pause for the broker, resume on replies, reach review with the right facts",
  async run() {
    return journeyCases.map<CaseResult>((item) => {
      const problems: string[] = [];
      const texts = [item.submission];
      let facts = buildFacts(item.intake, parseBrokerNotes(item.submission));
      for (const [revision, expected] of item.expected.entries()) {
        if (revision > 0) texts.push(item.replies[revision - 1]);
        facts = buildFacts(item.intake, parseBrokerNotes(texts.join(BROKER_UPDATE_SEPARATOR)));
        const result = evaluateFacts(facts);
        const status: CaseStatus = result.question ? "waiting_for_broker" : "review_ready";
        if (status !== expected.status) problems.push(`revision ${revision}: status ${status} expected ${expected.status}`);
        const referrals = result.findings.filter((finding) => finding.result === "refer").length;
        if (expected.referrals !== undefined && referrals !== expected.referrals) problems.push(`revision ${revision}: ${referrals} referrals expected ${expected.referrals}`);
        if (expected.question !== undefined && result.question !== expected.question) problems.push(`revision ${revision}: question "${result.question}" expected "${expected.question}"`);
      }
      if (item.expected.length !== item.replies.length + 1) problems.push("case definition must have one expectation per revision");
      const finalFacts = { yearBuilt: facts.yearBuilt.value, losses: facts.losses.value };
      if (item.finalFacts && !same(finalFacts, item.finalFacts)) problems.push(`final facts ${JSON.stringify(finalFacts)} expected ${JSON.stringify(item.finalFacts)}`);
      return { name: item.name, passed: problems.length === 0, detail: problems.join("; ") || undefined, note: item.note };
    });
  },
};
