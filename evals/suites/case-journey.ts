import { BROKER_UPDATE_SEPARATOR, buildFacts, evaluateFacts, parseBrokerNotes, type Intake } from "../../src/agent/analysis";
import { mergeCaseAppetite } from "../../src/lib/case-appetite";
import type { CaseStatus } from "../../src/lib/types";
import { attempt, same, type CaseResult, type Suite } from "../runner";

/**
 * Whole-case journeys through the durable workflow, run in process. Each broker
 * reply starts a new analysis revision: explicit appetite lines in the reply
 * override the submission, and the joined text is re-read for year built and
 * claim count, exactly as the worker does. Expected values are the status after
 * each revision and the facts the underwriter finally sees.
 */
type Revision = { status: Extract<CaseStatus, "waiting_for_broker" | "review_ready">; referrals?: number; question?: string[] };
type Case = { name: string; intake: Omit<Intake, "appetite">; submission: string; replies: string[]; expected: Revision[]; finalFacts?: { yearBuilt: number | null; lossValue: number | null }; note?: string };

const appetiteLines = "Business type: new\nLine of business: property\nPremium: $85,000\nEligible construction percent: 75%\nEffective date: 2026-01-01\nExpiration date: 2027-01-01";
const intake = (overrides: Partial<Omit<Intake, "appetite">> = {}): Omit<Intake, "appetite"> => ({ insuredName: "Journey property", state: "CO", tiv: 75_000_000, yearBuilt: null, losses: null, ...overrides });

/** Mirrors extractCase + checkCase: appetite from the first text, then replies override; the year comes from the joined text. */
function analyze(item: Case, texts: string[]) {
  const appetite = mergeCaseAppetite(texts[0], undefined, texts.slice(1).join("\n"));
  const facts = buildFacts({ ...item.intake, appetite }, parseBrokerNotes(texts.join(BROKER_UPDATE_SEPARATOR)));
  const result = evaluateFacts(facts);
  return { facts, result, status: (result.question ? "waiting_for_broker" : "review_ready") as CaseStatus };
}

export const journeyCases: Case[] = [
  {
    name: "submission without loss dollars pauses, reply with dollars and completeness proceeds",
    intake: intake({ yearBuilt: 2015 }),
    submission: `${appetiteLines}\nWarehouse constructed in 2015. No losses in the past three years.`,
    replies: ["Five-year loss value: $12,000\nFive-year history complete: yes"],
    expected: [{ status: "waiting_for_broker", question: ["Five-year loss value"] }, { status: "review_ready", referrals: 0 }],
    finalFacts: { yearBuilt: 2015, lossValue: 12_000 },
    note: "'No losses in the past three years' is a count, not the five-year dollar figure the appetite needs.",
  },
  {
    name: "reply with the year reveals a pre-1990 building that is referred, not approved",
    intake: intake(),
    submission: `${appetiteLines}\nFive-year loss value: 0\nFive-year history complete: yes\nConstruction year to follow.`,
    replies: ["The building was constructed in 1985."],
    expected: [{ status: "waiting_for_broker", question: ["Building age"] }, { status: "review_ready", referrals: 1 }],
    finalFacts: { yearBuilt: 1985, lossValue: 0 },
  },
  {
    name: "two follow-ups collect premium and then loss history",
    intake: intake({ yearBuilt: 2012 }),
    submission: "Business type: new\nLine of business: property\nEligible construction percent: 75%\nEffective date: 2026-01-01\nExpiration date: 2027-01-01\nPremium and loss runs to follow.",
    replies: ["Premium: $90,000", "Five-year loss value: $40,000\nFive-year history complete: yes"],
    expected: [{ status: "waiting_for_broker", question: ["Total premium", "Five-year loss value"] }, { status: "waiting_for_broker", question: ["Five-year loss value"] }, { status: "review_ready", referrals: 0 }],
    finalFacts: { yearBuilt: 2012, lossValue: 40_000 },
  },
  {
    name: "complete submission goes straight to review with no referrals",
    intake: intake({ yearBuilt: 2015 }),
    submission: `${appetiteLines}\nFive-year loss value: 0\nFive-year history complete: yes`,
    replies: [],
    expected: [{ status: "review_ready", referrals: 0 }],
    finalFacts: { yearBuilt: 2015, lossValue: 0 },
  },
  {
    name: "renewal submission goes straight to review as an exception",
    intake: intake({ yearBuilt: 2015 }),
    submission: `${appetiteLines.replace("Business type: new", "Business type: renewal")}\nFive-year loss value: 0\nFive-year history complete: yes`,
    replies: [],
    expected: [{ status: "review_ready", referrals: 1 }],
  },
  {
    name: "a reply with only a claim count keeps waiting for loss dollars",
    intake: intake({ yearBuilt: 2010 }),
    submission: `${appetiteLines}\nLoss history to follow.`,
    replies: ["No losses in the past three years."],
    expected: [{ status: "waiting_for_broker", question: ["Five-year loss value"] }, { status: "waiting_for_broker", question: ["Five-year loss value"] }],
    finalFacts: { yearBuilt: 2010, lossValue: null },
    note: "A claim count must not be read as a dollar figure; the agent keeps asking.",
  },
  {
    name: "large incomplete losses are referred rather than asked about again",
    intake: intake({ yearBuilt: 2015 }),
    submission: `${appetiteLines}\nFive-year loss value: $250,000\nFive-year history complete: no`,
    replies: [],
    expected: [{ status: "review_ready", referrals: 1 }],
    finalFacts: { yearBuilt: 2015, lossValue: 250_000 },
  },
];

export const journeySuite: Suite = {
  name: "case-journey",
  description: "Multi-revision case flow on the carrier appetite: pause for the broker, resume on replies, reach review with the right facts",
  async run() {
    return journeyCases.map<CaseResult>((item) => attempt(item.name, () => {
      const problems: string[] = [];
      if (item.expected.length !== item.replies.length + 1) problems.push("case definition must have one expectation per revision");
      const texts = [item.submission];
      let last = analyze(item, texts);
      for (const [revision, expected] of item.expected.entries()) {
        if (revision > 0) texts.push(item.replies[revision - 1]);
        last = analyze(item, texts);
        if (last.status !== expected.status) problems.push(`revision ${revision}: status ${last.status} expected ${expected.status}`);
        const referrals = last.result.findings.filter((finding) => finding.result === "refer").length;
        if (expected.referrals !== undefined && referrals !== expected.referrals) problems.push(`revision ${revision}: ${referrals} referrals expected ${expected.referrals}`);
        for (const part of expected.question ?? []) if (!last.result.question?.includes(part)) problems.push(`revision ${revision}: question "${last.result.question}" lacks "${part}"`);
      }
      const finalFacts = { yearBuilt: last.facts.yearBuilt.value, lossValue: last.result.appetiteResult.criteria.find((criterion) => criterion.concept === "lossValue")?.status === "unknown" ? null : last.facts.appetite?.value?.lossValue ?? null };
      if (item.finalFacts && !same(finalFacts, item.finalFacts)) problems.push(`final facts ${JSON.stringify(finalFacts)} expected ${JSON.stringify(item.finalFacts)}`);
      return problems;
    }, item.note));
  },
};
