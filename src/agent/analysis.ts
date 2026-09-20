import type { Facts, Finding } from "../lib/types";
import { brokerAppetiteInstructions, caseAppetiteSchema, caseMapping, type CaseAppetite } from "../lib/case-appetite";
import { scoreSubmission, type RankedSubmission } from "../federato/scoring";

export type Intake = {
  state: string | null;
  tiv: number | null;
  yearBuilt: number | null;
  losses: number | null;
  insuredName?: string;
  appetite?: CaseAppetite;
};

export type Extracted = { yearBuilt: number | null; losses: number | null };

/** Joins the original submission with processed broker replies so later updates can supersede earlier details. */
export const BROKER_UPDATE_SEPARATOR = "\n\n--- BROKER UPDATE ---\n\n";

const countWords: Record<string, number> = { zero: 0, none: 0, nil: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const countPattern = "\\d+|zero|none|nil|one|two|three|four|five|six|seven|eight|nine|ten";
function parseCount(value: string): number {
  return /^\d+$/.test(value) ? Number(value) : countWords[value.toLowerCase()] ?? Number.NaN;
}

// "in the past five years" after a count; the guideline asks for three years.
const windowPattern = `(?:\\s+(?:in|over|during|for)\\s+(?:the\\s+)?(?:last|past|prior|previous)\\s+(?:(${countPattern})\\s+)?(years?|months?))?`;
function windowYears(count: string | undefined, unit: string | undefined): number | null {
  if (!unit) return null;
  const value = count ? parseCount(count) : 1;
  return unit.toLowerCase().startsWith("month") ? value / 12 : value;
}

const yearPatterns = [
  /(?:built|constructed|erected)(?:\s+in)?\s*[:#-]?\s*(1[89]\d{2}|20\d{2})\b/gi,
  /\byear\s+(?:of\s+)?(?:built|construction)\s*[:#-]?\s*(1[89]\d{2}|20\d{2})\b/gi,
  /\bconstruction\s+(?:year|date)\s*[:#-]?\s*(1[89]\d{2}|20\d{2})\b/gi,
];
const correction = /\b(?:correct(?:ed|ion)?|updated?|revised|revision|actually|instead|supersed|amend)/i;

/** The sentence around a match, so a corrected year can be told apart from a second building. */
function sentenceAround(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf(".", index), text.lastIndexOf(";", index), text.lastIndexOf("\n", index)) + 1;
  const rest = text.slice(index).search(/[.;\n]/);
  return text.slice(start, rest === -1 ? text.length : index + rest);
}

/** Oldest stated year in a note, unless a later sentence corrects it; a later broker update always supersedes. */
function parseYearBuilt(segment: string): number | null {
  const thisYear = new Date().getUTCFullYear();
  const found: { index: number; value: number }[] = [];
  for (const pattern of yearPatterns) {
    for (const match of segment.matchAll(pattern)) {
      const value = Number(match[1]);
      if (value <= thisYear && !found.some((item) => item.index === match.index)) found.push({ index: match.index, value });
    }
  }
  if (!found.length) return null;
  found.sort((left, right) => left.index - right.index);
  const corrected = found.filter((item) => correction.test(sentenceAround(segment, item.index)));
  return corrected.length ? corrected[corrected.length - 1].value : Math.min(...found.map((item) => item.value));
}

/** Three-year loss or claim count; later statements supersede earlier ones. Counts over other windows are ignored unless zero. */
function parseLosses(text: string): number | null {
  const candidates: { index: number; value: number }[] = [];
  const consider = (index: number, value: number, window: number | null) => {
    // Hundreds of claims in three years is a year or an amount that slipped past the keyword, not a count.
    if (!Number.isFinite(value) || value > 100) return;
    if (window !== null && window !== 3 && !(value === 0 && window > 3)) return;
    candidates.push({ index, value });
  };
  const keyword = "losses|claims|loss|claim";
  for (const match of text.matchAll(new RegExp(`\\b(?:${keyword})(?:\\s+(?:history|count))?${windowPattern}\\s*[:#-]?\\s*(${countPattern})\\b`, "gi"))) {
    consider(match.index, parseCount(match[3]), windowYears(match[1], match[2]));
  }
  // A count directly before the keyword; never a fragment of a dollar figure.
  for (const match of text.matchAll(new RegExp(`(?<![\\d,.$])\\b(${countPattern})\\s+(?:[a-z]+\\s+)?(?:${keyword})\\b${windowPattern}`, "gi"))) {
    consider(match.index, parseCount(match[1]), windowYears(match[2], match[3]));
  }
  for (const match of text.matchAll(new RegExp(`\\bno\\s+(?:[a-z]+\\s+)?(?:losses|claims)\\b(?!\\s+(?:history|information|runs?|data|details?|summary))${windowPattern}`, "gi"))) {
    consider(match.index, 0, windowYears(match[1], match[2]));
  }
  for (const match of text.matchAll(/\b(?:loss|claims?)[-\s]free\b/gi)) consider(match.index, 0, null);
  candidates.sort((left, right) => left.index - right.index);
  return candidates.length ? candidates[candidates.length - 1].value : null;
}

export function parseBrokerNotes(text: string): Extracted {
  const years = text.split(BROKER_UPDATE_SEPARATOR).map(parseYearBuilt).filter((value): value is number => value !== null);
  return { yearBuilt: years.length ? years[years.length - 1] : null, losses: parseLosses(text) };
}

export function buildFacts(intake: Intake, extracted: Extracted): Facts {
  return {
    appetite: { value: { ...caseAppetiteSchema.parse(intake.appetite ?? {}), account: intake.insuredName ?? "" }, source: "Intake and explicit broker appetite fields (USD)", confidence: intake.appetite ? 1 : 0 },
    state: { value: intake.state, source: intake.state === null ? "Not provided" : "Intake form", confidence: intake.state === null ? 0 : 1 },
    tiv: { value: intake.tiv, source: intake.tiv === null ? "Not provided" : "Intake form", confidence: intake.tiv === null ? 0 : 1 },
    yearBuilt: intake.yearBuilt === null
      ? { value: extracted.yearBuilt, source: extracted.yearBuilt === null ? "Not provided" : "Broker text", confidence: extracted.yearBuilt === null ? 0 : 0.75 }
      : { value: intake.yearBuilt, source: "Intake form", confidence: 1 },
    losses: intake.losses === null
      ? { value: extracted.losses, source: extracted.losses === null ? "Not provided" : "Broker text", confidence: extracted.losses === null ? 0 : 0.75 }
      : { value: intake.losses, source: "Intake form", confidence: 1 },
  };
}

export function evaluateFacts(facts: Facts): { findings: Finding[]; question: string | null; brief: string; appetiteResult: RankedSubmission } {
  const appetite = facts.appetite?.value;
  const row = {
    ...appetite, id: "case", state: facts.state.value, tiv: facts.tiv.value, year: facts.yearBuilt.value,
    lossValue: appetite?.lossHistoryComplete || (appetite?.lossValue ?? 0) > 100_000 ? appetite?.lossValue : null,
  };
  const appetiteResult = scoreSubmission(row, caseMapping);
  const sources: Record<string, string> = { state: facts.state.source, tiv: facts.tiv.source, year: facts.yearBuilt.source };
  const findings: Finding[] = appetiteResult.criteria.map((criterion) => {
    criterion.source = sources[criterion.concept] ?? facts.appetite?.source ?? "Not provided";
    return { id: criterion.concept, label: criterion.factor, result: criterion.status === "unknown" ? "unknown" : criterion.status === "outside" ? "refer" : "pass", detail: criterion.detail, source: criterion.source };
  });
  const missing = appetiteResult.missingData;
  const question = missing.length ? `Please provide or clarify: ${missing.join(", ")}. ${brokerAppetiteInstructions}` : null;
  return { findings, question, brief: appetiteResult.explanation, appetiteResult };
}
