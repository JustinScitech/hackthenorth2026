import { concepts, readValues, type Concept, type Mapping } from "./schema";
import { scoreSubmission, type Criterion, type RankedSubmission } from "./scoring";

/**
 * "What would change it": for every appetite factor a submission fails or cannot prove, the smallest
 * single-factor change that would make that factor pass, and the score the submission would then get.
 *
 * No threshold is written in this file. Each edge is found by re-scoring patched copies of the row with
 * scoreSubmission, so the counterfactuals always follow the live appetite rules and cannot drift from them.
 * The file only knows the shape of each factor (a dollar amount, a percentage, a year, a label) and how to
 * phrase it; immutable facts such as the year built are worded as conditions, never as things to do.
 */
export type CounterfactualPatch = Partial<Record<Concept, unknown>>;
export type Counterfactual = {
  concept: Concept;
  factor: string;
  /** What the factor is today: an exception, or a gap the submission cannot prove. */
  status: "outside" | "unknown";
  /** The value the appetite check established; null when it could not establish one. */
  currentValue: string | number | null;
  /** The nearest value that passes: the exact edge the scorer accepts. */
  requiredValue: string | number;
  projectedScore: number;
  projectedAction: string;
  /** The change keyed by concept, ready for whatIf. */
  patch: CounterfactualPatch;
  /** The conditional alone, for briefs and slides: "If eligible construction were more than 50%, it would score 82 and pass." */
  condition: string;
  /** The full sentence, opening with where the submission stands today. */
  sentence: string;
};

type Status = Criterion["status"];
const passes = (status: Status | undefined) => status === "target" || status === "acceptable";
const money = (value: number) => `$${value.toLocaleString("en-US")}`;
const stateCodes = ["AK", "AL", "AR", "AZ", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY"].sort();
/** A geometric 1-2-5 grid of dollar amounts: coarse samples that bracket any band, refined to the dollar by bisection. */
const dollars = [0, ...Array.from({ length: 11 }, (_, power) => [1, 2, 5].map((step) => step * 10 ** power)).flat()];
/** Evenly spaced samples from `from` to `to` inclusive; bisection between neighbours finds the exact unit. */
const range = (from: number, to: number, step: number) => [...Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, index) => from + index * step), ...(((to - from) % step) ? [to] : [])];

type Phrasing = { noun: string; had?: (bound: string) => string; confirm?: (bound: string) => string };
type NumberFactor = { kind: "number"; immutable: boolean; units: "money" | "percent" | "year"; grid: (asOf: Date) => number[]; oldest?: boolean } & Phrasing;
type LabelFactor = { kind: "label"; immutable: boolean; candidates: { value: string; label: string }[]; normalize: (value: string) => string } & Phrasing;
const factors: Partial<Record<Concept, NumberFactor | LabelFactor>> = {
  business: { kind: "label", immutable: true, noun: "the submission type", candidates: [{ value: "new", label: "new business" }, { value: "renewal", label: "renewal business" }], normalize: (value) => value.trim().toLowerCase(), had: (bound) => `Had this been ${bound}` },
  line: { kind: "label", immutable: true, noun: "the line of business", candidates: [{ value: "property", label: "property" }], normalize: (value) => value.trim().toLowerCase() },
  state: { kind: "label", immutable: true, noun: "the primary risk state", candidates: stateCodes.map((code) => ({ value: code, label: code })), normalize: (value) => value.trim().toUpperCase() },
  tiv: { kind: "number", immutable: false, units: "money", noun: "the total insured value", grid: () => dollars },
  premium: { kind: "number", immutable: false, units: "money", noun: "the premium", grid: () => dollars },
  year: { kind: "number", immutable: true, units: "year", noun: "the year built", oldest: true, grid: (asOf) => range(1800, asOf.getUTCFullYear(), 10), had: (bound) => `Had the oldest building been built in ${bound}` },
  constructionPercent: { kind: "number", immutable: false, units: "percent", noun: "eligible construction", grid: () => range(0, 100, 5) },
  lossValue: { kind: "number", immutable: true, units: "money", noun: "five-year losses", grid: () => dollars },
};

/** Returns a copy of `row` with each patched concept written at its mapped path, through arrays, creating parents as needed. */
export function applyPatch(row: Record<string, unknown>, mapping: Mapping, patch: CounterfactualPatch): Record<string, unknown> {
  const write = (current: unknown, parts: string[], value: unknown): unknown => {
    if (!parts.length) return value;
    if (Array.isArray(current)) return current.map((item) => write(item, parts, value));
    const object = current && typeof current === "object" ? (current as Record<string, unknown>) : {};
    return { ...object, [parts[0]]: write(object[parts[0]], parts.slice(1), value) };
  };
  let patched: unknown = row;
  for (const [concept, value] of Object.entries(patch)) {
    const path = mapping[concept as Concept];
    if (path) patched = write(patched, path.split("."), value);
  }
  return patched as Record<string, unknown>;
}

const identityMapping: Mapping = Object.fromEntries(concepts.map((concept) => [concept, concept]));

/** Re-scores a patched copy of the row next to the original, for "what if" questions from a chat tool. */
export function whatIf(row: Record<string, unknown>, patch: CounterfactualPatch, options: { mapping?: Mapping; idPath?: string; asOf?: Date } = {}) {
  const { mapping = identityMapping, idPath = "id", asOf = new Date() } = options;
  const before = scoreSubmission(row, mapping, idPath, asOf);
  const after = scoreSubmission(applyPatch(row, mapping, patch), mapping, idPath, asOf);
  const changes = before.criteria.flatMap((criterion) => {
    const to = after.criteria.find((item) => item.concept === criterion.concept)?.status ?? criterion.status;
    return to === criterion.status ? [] : [{ concept: criterion.concept, factor: criterion.factor, from: criterion.status, to }];
  });
  return { before, after, patch, changes };
}

const trailingZeros = (value: number) => value === 0 ? Number.POSITIVE_INFINITY : String(Math.abs(Math.round(value))).match(/0*$/)![0].length;
function format(factor: NumberFactor, value: number) {
  return factor.units === "money" ? money(value) : factor.units === "percent" ? `${value}%` : String(value);
}
/** The bound as an underwriter would say it: whichever of the inclusive and exclusive forms lands on the rounder number. */
function bound(factor: NumberFactor, edge: number, side: "low" | "high"): string {
  const exclusive = side === "low" ? edge - 1 : edge + 1;
  if (factor.units === "year") return side === "low" ? `${edge} or later` : `${edge} or earlier`;
  const useExclusive = trailingZeros(exclusive) > trailingZeros(edge);
  if (side === "low") return useExclusive ? `more than ${format(factor, exclusive)}` : `at least ${format(factor, edge)}`;
  return useExclusive ? `under ${format(factor, exclusive)}` : `at most ${format(factor, edge)}`;
}

const join = (items: string[], word: "or" | "and") => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} ${word} ${items.at(-1)}`;

function ending(after: RankedSubmission): string {
  const score = `it would score ${after.score}`;
  if (after.recommendation === "Refer for appetite exceptions") return `${score} and stay outside appetite on ${join(after.criteria.filter((item) => item.status === "outside").map((item) => item.factor.toLowerCase()), "and")}.`;
  if (after.recommendation === "Investigate missing or ambiguous data") return `${score}, with ${join(after.missingData.map((item) => item.toLowerCase()), "and")} still to confirm.`;
  return `${score} and pass.`;
}

function numberCounterfactual(concept: Concept, factor: NumberFactor, criterion: Criterion, row: Record<string, unknown>, mapping: Mapping, probe: (value: unknown) => RankedSubmission, asOf: Date) {
  const grid = factor.grid(asOf);
  const ok = (value: number) => passes(probe(value).criteria.find((item) => item.concept === concept)?.status);
  const verdicts = grid.map(ok);
  const first = verdicts.indexOf(true);
  if (first < 0) return null;
  const last = verdicts.lastIndexOf(true);
  // Bisection between a failing and a passing sample: the edge to the exact unit, with no threshold assumed.
  const up = (fail: number, pass: number) => { while (pass - fail > 1) { const mid = Math.floor((fail + pass) / 2); if (ok(mid)) pass = mid; else fail = mid; } return pass; };
  const down = (pass: number, fail: number) => { while (fail - pass > 1) { const mid = Math.floor((pass + fail) / 2); if (ok(mid)) pass = mid; else fail = mid; } return pass; };
  // Edges are refined only when needed: a value below the band needs the lower edge, one above it the upper edge.
  const edges = { low: () => { const low = first === 0 ? null : up(grid[first - 1], grid[first]); return low !== null && factor.units === "money" && low <= 1 ? null : low; }, high: () => last === grid.length - 1 ? null : down(grid[last], grid[last + 1]) };
  const observed = readValues(row, mapping[concept]!).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const current = criterion.status === "unknown" ? null : factor.oldest ? (observed.length ? Math.min(...observed) : null) : observed.length === 1 ? observed[0] : null;
  if (current !== null && current < grid[first]) { const low = edges.low(); if (low !== null) return { current, required: low, text: bound(factor, low, "low") }; }
  if (current !== null && current > grid[last]) { const high = edges.high(); if (high !== null) return { current, required: high, text: bound(factor, high, "high") }; }
  const low = edges.low(), high = edges.high();
  if (low !== null && high !== null) return { current, required: low, text: `between ${format(factor, low)} and ${format(factor, high)}` };
  if (low !== null) return { current, required: low, text: bound(factor, low, "low") };
  if (high !== null) return { current, required: high, text: bound(factor, high, "high") };
  return { current, required: grid[first], text: format(factor, grid[first]) };
}

function labelCounterfactual(concept: Concept, factor: LabelFactor, criterion: Criterion, row: Record<string, unknown>, mapping: Mapping, probe: (value: unknown) => RankedSubmission) {
  const accepted = factor.candidates.filter((candidate) => passes(probe(candidate.value).criteria.find((item) => item.concept === concept)?.status));
  if (!accepted.length) return null;
  const observed = readValues(row, mapping[concept]!);
  const current = criterion.status === "unknown" || observed.length !== 1 || typeof observed[0] !== "string" ? null : factor.normalize(observed[0]);
  return { current, required: accepted[0].value, text: join(accepted.map((candidate) => candidate.label), "or") };
}

/** The smallest single-factor change for each factor outside appetite or unknown, sorted by projected gain, at most three. */
export function counterfactuals(row: Record<string, unknown>, mapping: Mapping, idPath = "id", asOf = new Date()): Counterfactual[] {
  try {
    const before = scoreSubmission(row, mapping, idPath, asOf);
    const outside = before.criteria.some((item) => item.status === "outside");
    const lead = `This is ${outside ? "outside appetite" : "incomplete"} at ${before.score}/100.`;
    const found = before.criteria.flatMap((criterion, index) => {
      const factor = factors[criterion.concept];
      if (!factor || !mapping[criterion.concept] || (criterion.status !== "outside" && criterion.status !== "unknown")) return [];
      try {
        const probe = (value: unknown) => scoreSubmission(applyPatch(row, mapping, { [criterion.concept]: value }), mapping, idPath, asOf);
        const change = factor.kind === "number" ? numberCounterfactual(criterion.concept, factor, criterion, row, mapping, probe, asOf) : labelCounterfactual(criterion.concept, factor, criterion, row, mapping, probe);
        if (!change) return [];
        const patch: CounterfactualPatch = { [criterion.concept]: change.required };
        const after = probe(change.required);
        if (!passes(after.criteria.find((item) => item.concept === criterion.concept)?.status)) return [];
        const opening = criterion.status === "unknown"
          ? factor.confirm?.(change.text) ?? `If ${factor.noun} were confirmed to be ${change.text}`
          : factor.immutable ? factor.had?.(change.text) ?? `Had ${factor.noun} been ${change.text}` : `If ${factor.noun} were ${change.text}`;
        const condition = `${opening}, ${ending(after)}`;
        const item: Counterfactual = { concept: criterion.concept, factor: criterion.factor, status: criterion.status, currentValue: change.current, requiredValue: change.required, projectedScore: after.score, projectedAction: after.recommendation, patch, condition, sentence: `${lead} ${condition}` };
        return [{ item, gain: after.score - before.score, rawGain: after.rawScore - before.rawScore, index }];
      } catch {
        return [];
      }
    });
    return found.sort((a, b) => b.gain - a.gain || b.rawGain - a.rawGain || a.index - b.index).slice(0, 3).map((entry) => entry.item);
  } catch {
    return [];
  }
}

/** One clause for a brief: "What would change it: If ... If ..." or nothing. */
export function describeCounterfactuals(items: Counterfactual[] | undefined): string {
  return items?.length ? `What would change it: ${items.map((item) => item.condition).join(" ")}` : "";
}
