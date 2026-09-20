import type { Facts, Finding } from "../lib/types";
import { brokerAppetiteInstructions, caseAppetiteSchema, caseMapping, type CaseAppetite } from "../lib/case-appetite";
import { scoreSubmission, type RankedSubmission } from "../federato/scoring";

export type Intake = {
  state: string;
  tiv: number;
  yearBuilt: number | null;
  losses: number | null;
  insuredName?: string;
  appetite?: CaseAppetite;
};

export type Extracted = { yearBuilt: number | null; losses: number | null };

const countWords: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
function parseCount(value: string): number {
  return /^\d+$/.test(value) ? Number(value) : countWords[value.toLowerCase()] ?? Number.NaN;
}

export function parseBrokerNotes(text: string): Extracted {
  const years = [...text.matchAll(/(?:built|constructed)(?:\s+in)?\s*[:#-]?\s*(19\d{2}|20\d{2})\b/gi)];
  const lossCandidates: { index: number; value: number }[] = [];
  for (const match of text.matchAll(/(?:losses|claims)(?:\s+in\s+(?:the\s+)?(?:last|past)\s+(?:\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+years?)?\s*[:#-]?\s*(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi)) {
    const value = parseCount(match[1]);
    if (Number.isFinite(value)) lossCandidates.push({ index: match.index, value });
  }
  for (const match of text.matchAll(/\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:recent\s+)?(?:losses|claims)\b/gi)) {
    const value = parseCount(match[1]);
    if (Number.isFinite(value)) lossCandidates.push({ index: match.index, value });
  }
  for (const match of text.matchAll(/\bno\s+(?:recent\s+)?(?:losses|claims)\b/gi)) {
    lossCandidates.push({ index: match.index, value: 0 });
  }
  lossCandidates.sort((left, right) => left.index - right.index);
  return {
    yearBuilt: years.length ? Number(years[years.length - 1][1]) : null,
    losses: lossCandidates.length ? lossCandidates[lossCandidates.length - 1].value : null,
  };
}

export function buildFacts(intake: Intake, extracted: Extracted): Facts {
  return {
    appetite: { value: { ...caseAppetiteSchema.parse(intake.appetite ?? {}), account: intake.insuredName ?? "" }, source: "Intake and explicit broker appetite fields (USD)", confidence: intake.appetite ? 1 : 0 },
    state: { value: intake.state, source: "Intake form", confidence: 1 },
    tiv: { value: intake.tiv, source: "Intake form", confidence: 1 },
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
