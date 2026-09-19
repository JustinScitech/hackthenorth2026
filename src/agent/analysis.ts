import type { Facts, Finding } from "../lib/types";

export type Intake = {
  state: string;
  tiv: number;
  yearBuilt: number | null;
  losses: number | null;
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

// Fictional thresholds for the demo, not insurance advice or live underwriting rules.
export function evaluateFacts(facts: Facts): { findings: Finding[]; question: string | null; brief: string } {
  const findings: Finding[] = [];
  const state = facts.state.value?.toUpperCase() ?? "";
  findings.push({
    id: "territory", label: "Territory", result: ["NY", "NJ", "PA"].includes(state) ? "pass" : "refer",
    detail: ["NY", "NJ", "PA"].includes(state) ? `${state} is in the demo territory.` : `${state || "Unknown state"} needs an underwriter referral.`,
    source: facts.state.source,
  });
  const tiv = facts.tiv.value;
  findings.push({
    id: "tiv", label: "Total insured value", result: tiv !== null && tiv <= 5_000_000 ? "pass" : "refer",
    detail: tiv !== null && tiv <= 5_000_000 ? "Within the $5 million demo limit." : "Above the $5 million demo limit; referral required.",
    source: facts.tiv.source,
  });
  const year = facts.yearBuilt.value;
  findings.push({
    id: "construction", label: "Year built", result: year === null ? "unknown" : year >= 1980 ? "pass" : "refer",
    detail: year === null ? "Construction year is missing." : year >= 1980 ? "Meets the demo construction-year rule." : "Pre-1980 building; referral required.",
    source: facts.yearBuilt.source,
  });
  const losses = facts.losses.value;
  findings.push({
    id: "losses", label: "Recent losses", result: losses === null ? "unknown" : losses <= 2 ? "pass" : "refer",
    detail: losses === null ? "Recent loss count is missing." : losses <= 2 ? "Within the demo loss-count rule." : "More than two recent losses; referral required.",
    source: facts.losses.source,
  });
  const missing = [year === null ? "year built" : null, losses === null ? "number of losses in the past three years" : null].filter(Boolean);
  const question = missing.length ? `Please provide the ${missing.join(" and ")} for this property.` : null;
  const referrals = findings.filter((finding) => finding.result === "refer");
  const brief = [
    referrals.length
      ? `${referrals.length} guideline exception${referrals.length === 1 ? " requires" : "s require"} underwriter review: ${referrals.map((finding) => finding.label.toLowerCase()).join(", ")}.`
      : "No exceptions found against the fictional demo guidelines.",
    question ? "Required information is still missing; review is not ready." : null,
  ].filter(Boolean).join(" ");
  return { findings, question, brief };
}
