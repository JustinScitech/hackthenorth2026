export type SourceKind = "intake" | "model" | "parser";
export type FieldCandidate = { source: string; kind: SourceKind; value: number | null };
export type Resolved = { value: number | null; source: string; confidence: number; conflict: string | null };

const describe = (candidates: FieldCandidate[]) => candidates.map((candidate) => `${candidate.source} ${candidate.value}`).join(", ");

/**
 * Resolves one fact from several sources. The underwriter's intake wins
 * outright; otherwise the value with the most independent support wins and
 * confidence reflects that support. Disagreement is always reported so the
 * reviewer sees it, even when the intake settles the value.
 */
export function resolveField(label: string, candidates: FieldCandidate[]): Resolved {
  const stated = candidates.filter((candidate) => candidate.value !== null);
  const distinct = [...new Set(stated.map((candidate) => candidate.value))];
  const conflict = distinct.length > 1 ? `${label} differs: ${describe(stated)}.` : null;
  const intake = stated.find((candidate) => candidate.kind === "intake");
  if (intake) return { value: intake.value, source: intake.source, confidence: 1, conflict };
  if (!stated.length) return { value: null, source: "Not provided", confidence: 0, conflict: null };

  const support = distinct.map((value) => ({ value, backers: stated.filter((candidate) => candidate.value === value) }));
  const best = Math.max(...support.map((item) => item.backers.length));
  const leaders = support.filter((item) => item.backers.length === best);
  // Ties fall to the earliest stated candidate, which callers order by trust (models before parser).
  const winner = leaders.length === 1 ? leaders[0] : support.find((item) => item.value === stated[0].value)!;
  const lead = winner.backers.find((candidate) => candidate.kind === "model") ?? winner.backers[0];
  const dissenters = stated.length - winner.backers.length;
  const confidence = winner.backers.length >= 3 ? 0.95
    : winner.backers.length === 2 ? (dissenters ? 0.85 : 0.9)
      : dissenters >= 2 ? 0.4 : dissenters === 1 ? 0.5 : lead.kind === "model" ? 0.75 : 0.6;
  return { value: winner.value, source: lead.source, confidence, conflict };
}
