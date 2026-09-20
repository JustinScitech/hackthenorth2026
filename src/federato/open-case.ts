import { brokerAppetiteInstructions, caseAppetiteSchema, type CaseAppetite } from "../lib/case-appetite";
import type { CaseOrigin } from "../lib/types";
import { factorPhrase, nextStep } from "./disposition";
import type { RankedSubmission } from "./scoring";

/** The body `POST /api/cases` accepts, built from a ranked Federato submission. */
export type CaseDraft = {
  insuredName: string;
  state: string | null;
  tiv: number | null;
  yearBuilt: number | null;
  losses: null;
  appetite: CaseAppetite;
  brokerNotes: string;
  publicSourceUrl: null;
  origin: CaseOrigin;
};

export type QueueContext = { resource: string; rank: number; of: number; rankedAt: string };

const thisYear = () => new Date().getUTCFullYear();

/**
 * Turns a ranked submission into a case the agent can work: every verified fact goes in as intake
 * evidence, every open answer stays blank so the review pauses and asks the broker for it, and the
 * notes carry the same facts as labelled lines plus where each one came from.
 */
export function caseFromSubmission(item: RankedSubmission, context: QueueContext): CaseDraft {
  const facts = item.facts ?? { account: null, business: null, line: null, state: null, tiv: null, premium: null, year: null, constructionPercent: null, lossValue: null, effective: null, expiration: null };
  const status = (concept: string) => item.criteria.find((criterion) => criterion.concept === concept)?.status;
  const business = facts.business === null ? null : facts.business.includes("renewal") ? "renewal" : facts.business.includes("new") ? "new" : null;
  const year = facts.year !== null && Number.isInteger(facts.year) && facts.year >= 1800 && facts.year <= thisYear() ? facts.year : null;
  const appetite = caseAppetiteSchema.parse({
    business,
    line: facts.line,
    premium: facts.premium,
    constructionPercent: facts.constructionPercent !== null && facts.constructionPercent <= 100 ? facts.constructionPercent : null,
    lossValue: facts.lossValue,
    lossHistoryComplete: status("lossValue") === "target",
    effective: facts.effective,
    expiration: facts.expiration,
  });
  const step = nextStep(item);
  const labelled = [
    business && `Business type: ${business}`,
    facts.line && `Line of business: ${facts.line}`,
    facts.premium !== null && `Premium: ${facts.premium}`,
    appetite.constructionPercent !== null && `Eligible construction percent: ${appetite.constructionPercent}`,
    facts.lossValue !== null && `Five-year loss value: ${facts.lossValue}`,
    `Five-year history complete: ${appetite.lossHistoryComplete ? "yes" : "no"}`,
    facts.effective && `Effective date: ${facts.effective}`,
    facts.expiration && `Expiration date: ${facts.expiration}`,
  ].filter((line): line is string => typeof line === "string");
  const lifecycle = item.lifecycleStatus && item.lifecycleStatus !== "unknown" ? ` Lifecycle status: ${item.lifecycleStatus}.` : "";
  const notes = [
    `Federato ${context.resource} ${item.id}: ${item.account}. Ranked ${context.rank} of ${context.of} in the live queue on ${context.rankedAt.slice(0, 10)}.${lifecycle}`,
    item.evidenceNote ?? "",
    "",
    ...labelled,
    "",
    `Appetite read at intake: ${step.disposition}. ${step.why}`,
    step.questions.length ? `Open answers: ${step.questions.map((question) => `${question.item.toLowerCase()} (${question.source})`).join("; ")}.` : "",
    "",
    "Evidence by factor:",
    ...item.criteria.map((criterion) => `- ${criterion.factor}: ${factorPhrase(criterion, item.facts)}. Source: ${criterion.source}.`),
    "",
    `Broker replies can add missing figures on their own lines. ${brokerAppetiteInstructions}`,
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "");
  const account = (item.facts?.account ?? item.account).trim();
  return {
    insuredName: account.length >= 2 && account !== "Unknown account" ? account.slice(0, 160) : `Federato ${context.resource} ${item.id}`,
    state: facts.state && /^[A-Z]{2}$/.test(facts.state) ? facts.state : null,
    tiv: facts.tiv !== null && facts.tiv > 0 && facts.tiv <= 1_000_000_000 ? facts.tiv : null,
    yearBuilt: year,
    losses: null,
    appetite,
    brokerNotes: notes.join("\n").slice(0, 20_000),
    publicSourceUrl: null,
    origin: { system: "federato", resource: context.resource, id: item.id, rank: context.rank, of: context.of, rankedAt: context.rankedAt, lifecycleStatus: item.lifecycleStatus, evidenceNote: item.evidenceNote },
  };
}
