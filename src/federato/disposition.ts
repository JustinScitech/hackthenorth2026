import type { Concept } from "./schema";
import type { Criterion, RankedSubmission, SubmissionFacts } from "./scoring";

/**
 * The carrier's own vocabulary for a submission: the guideline table has Target, Acceptable,
 * and Not Acceptable columns, and anything the evidence leaves open needs information.
 * Ranking scores order the queue; the disposition is what an underwriter reads first.
 */
export type Disposition = "Target" | "Acceptable" | "Needs information" | "Outside appetite";
export const dispositionOrder: readonly Disposition[] = ["Target", "Acceptable", "Needs information", "Outside appetite"];

/** Factors where the guideline names a target band on top of the acceptable range. */
const targetTier = new Set<Concept>(["state", "tiv", "premium", "year"]);
const factorWeight: Record<string, number> = { state: 15, tiv: 15, premium: 15, year: 15, business: 10, line: 10, constructionPercent: 10, lossValue: 10 };

export type Classification = {
  disposition: Disposition;
  /** The factors (and required context items) that decided the disposition, heaviest first. */
  determining: string[];
  /** For Needs information: the disposition if every open answer came back inside appetite. */
  ifResolved: Disposition | null;
};

type Scored = Pick<RankedSubmission, "criteria" | "missingData">;

const factorNames = new Set(["Submission type", "Line of business", "Primary risk state", "Total insured value", "Total premium", "Building age", "Construction mix", "Five-year loss value"]);
const byWeight = (a: Criterion, b: Criterion) => (factorWeight[b.concept] ?? 0) - (factorWeight[a.concept] ?? 0);

export function classify(item: Scored): Classification {
  const outside = item.criteria.filter((criterion) => criterion.status === "outside").sort(byWeight);
  if (outside.length) return { disposition: "Outside appetite", determining: outside.map((criterion) => criterion.factor), ifResolved: null };
  const unknown = item.criteria.filter((criterion) => criterion.status === "unknown").sort(byWeight);
  const context = item.missingData.filter((entry) => !factorNames.has(entry));
  if (unknown.length || context.length) {
    const resolved = classify({ criteria: item.criteria.map((criterion) => criterion.status === "unknown" ? { ...criterion, status: targetTier.has(criterion.concept) ? "target" : criterion.concept === "lossValue" ? "target" : "acceptable" } : criterion), missingData: [] });
    return { disposition: "Needs information", determining: [...unknown.map((criterion) => criterion.factor), ...context], ifResolved: resolved.disposition };
  }
  const tiered = item.criteria.filter((criterion) => targetTier.has(criterion.concept));
  const held = tiered.filter((criterion) => criterion.status === "acceptable").sort(byWeight);
  if (held.length === 0 && tiered.length) return { disposition: "Target", determining: tiered.map((criterion) => criterion.factor), ifResolved: null };
  return { disposition: "Acceptable", determining: held.map((criterion) => criterion.factor), ifResolved: null };
}

export function money(value: number): string {
  const abs = Math.abs(value);
  const compact = abs >= 1_000_000 ? `${trim(abs / 1_000_000)}M` : abs >= 1_000 ? `${trim(abs / 1_000)}K` : abs.toLocaleString("en-US");
  return `$${compact}`;
}
function trim(value: number) { return (Math.round(value * 10) / 10).toString(); }

/** One short phrase per factor with the observed figure, so a row explains itself in a line. */
export function factorPhrase(criterion: Criterion, facts: SubmissionFacts | undefined): string {
  const f = facts ?? {} as Partial<SubmissionFacts>;
  const status = criterion.status;
  const needs: Partial<Record<Concept, unknown>> = { state: f.state, tiv: f.tiv, premium: f.premium, year: f.year, constructionPercent: f.constructionPercent, lossValue: f.lossValue };
  // Older stored results carry no figures; say the status plainly instead of quoting a blank.
  if (status !== "unknown" && criterion.concept in needs && (needs[criterion.concept] === null || needs[criterion.concept] === undefined)) {
    return `${criterion.factor.toLowerCase()} ${status === "target" ? "in the target band" : status === "acceptable" ? "acceptable" : "outside appetite"}`;
  }
  switch (criterion.concept) {
    case "business":
      return status === "unknown" ? "submission type missing" : status === "outside" ? "renewal business, which the guideline lists as unacceptable" : "new business";
    case "line":
      return status === "unknown" ? "line of business missing" : status === "outside" ? `${f.line ?? "another"} line, and the appetite covers property only` : "property line";
    case "state":
      return status === "unknown" ? "primary risk state unconfirmed" : status === "target" ? `${f.state} is a target state` : status === "acceptable" ? `${f.state} is an acceptable state` : `${f.state} is outside the accepted states`;
    case "tiv":
      return status === "unknown" ? "total insured value missing" : status === "target" ? `${money(f.tiv!)} TIV sits in the $50M to $100M target band` : status === "acceptable" ? `${money(f.tiv!)} TIV is inside the $150M limit` : `${money(f.tiv!)} TIV is over the $150M limit`;
    case "premium":
      return status === "unknown" ? "premium missing" : status === "target" ? `${money(f.premium!)} premium is in the $75K to $100K target band` : status === "acceptable" ? `${money(f.premium!)} premium is inside the $50K to $175K range` : `${money(f.premium!)} premium is ${f.premium! < 50_000 ? "under the $50K minimum" : "over the $175K maximum"}`;
    case "year":
      return status === "unknown" ? (f.year === 1990 ? "a 1990 building sits on the guideline boundary" : "building year missing") : status === "target" ? `oldest building ${f.year}, newer than 2010` : status === "acceptable" ? `oldest building ${f.year}, between 1990 and 2010` : `oldest building ${f.year}, older than 1990`;
    case "constructionPercent":
      return status === "unknown" ? (f.constructionPercent === 50 ? "50% eligible construction sits on the guideline boundary" : "construction mix missing") : status === "outside" ? `${f.constructionPercent}% eligible construction, under the 50% minimum` : `${f.constructionPercent}% eligible construction`;
    case "lossValue":
      return status === "unknown"
        ? (f.lossValue === 100_000 ? "$100K five-year losses sit on the guideline boundary" : f.lossLowerBound ? `five-year loss dollars unconfirmed; linked claims show at least ${money(f.lossLowerBound)}` : "five-year loss dollars missing")
        : status === "outside" ? `${money(f.lossValue!)} five-year losses, over the $100K limit` : `${money(f.lossValue!)} five-year losses, under $100K`;
    default:
      return criterion.factor.toLowerCase();
  }
}

/** Where an underwriter or the agent would get each missing answer. */
export function sourceHint(factorOrItem: string, facts?: SubmissionFacts): string {
  switch (factorOrItem) {
    case "Primary risk state": return "the location schedule, or the broker's stated primary risk state";
    case "Total insured value": return "the statement of values";
    case "Total premium": return "the broker's premium indication";
    case "Building age": return "the building schedule or a public property record";
    case "Construction mix": return "construction type per building, from the schedule or a public property record";
    case "Five-year loss value": return facts?.lossLowerBound ? `five-year loss runs from the broker; linked policy claims already show at least ${money(facts.lossLowerBound)}` : "five-year loss runs from the broker";
    default: return "the broker";
  }
}

export type NextStep = {
  disposition: Disposition;
  /** One line with the figures that decided it. */
  why: string;
  /** What the underwriter or the agent does next. */
  action: string;
  /** For open questions: each answer and where it comes from. */
  questions: { item: string; source: string }[];
  /** The disposition this becomes once the open answers land inside appetite. */
  ifResolved: Disposition | null;
};

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The whole card in four fields: what it is, why, what to do, and what would change it. */
export function nextStep(item: RankedSubmission): NextStep {
  const { disposition, determining, ifResolved } = classify(item);
  const facts = item.facts;
  const criterion = (factor: string) => item.criteria.find((entry) => entry.factor === factor);
  const phrase = (factor: string) => { const found = criterion(factor); return found ? factorPhrase(found, facts) : factor.toLowerCase(); };
  const inAppetite = item.criteria.filter((entry) => entry.status === "target" || entry.status === "acceptable");
  if (disposition === "Outside appetite") {
    const open = item.criteria.filter((entry) => entry.status === "unknown").map((entry) => entry.factor);
    return {
      disposition, ifResolved,
      why: `Outside appetite on ${joinList(determining.map((factor) => factor.toLowerCase()))}: ${joinList(determining.map(phrase))}.`,
      action: `An exception request is the route forward${open.length ? `; ${joinList(open.map((factor) => factor.toLowerCase()))} would also need confirming` : ""}.`,
      questions: open.map((factor) => ({ item: factor, source: sourceHint(factor, facts) })),
    };
  }
  if (disposition === "Needs information") {
    const count = determining.length;
    const open = determining.map((factor) => factor.toLowerCase());
    // Past a handful of open answers the list stops being readable in a line; lead with the heaviest two.
    const many = count >= 5;
    return {
      disposition, ifResolved,
      why: `Fits appetite on ${inAppetite.length} of 8 factors${inAppetite.length ? `: ${joinList(inAppetite.map((entry) => factorPhrase(entry, facts)))}` : ""}. ${count === 1 ? "One answer decides it" : `${count} answers decide it`}${many ? `, starting with ${open[0]} and ${open[1]}` : `: ${joinList(open)}`}.`,
      action: `Get ${many ? `all ${count} open answers` : joinList(open)}. With ${count === 1 ? "that answer" : "those answers"} inside appetite this becomes ${ifResolved}.`,
      questions: determining.map((factor) => ({ item: factor, source: sourceHint(factor, facts) })),
    };
  }
  if (disposition === "Target") {
    return { disposition, ifResolved, why: `Fits the target band on ${joinList(determining.map((factor) => factor.toLowerCase()))}: ${joinList(determining.map(phrase))}.`, action: "Prioritize for quote.", questions: [] };
  }
  return { disposition, ifResolved, why: determining.length ? `Fits appetite on all 8 factors. ${joinList(determining.map(phrase))}; ${determining.length === 1 ? "that keeps" : "those keep"} it out of the target band.` : "Fits appetite on every factor provided.", action: "Review for acceptance.", questions: [] };
}
