export type SourceKind = "intake" | "model" | "parser";
/** The kinds of value a broker note can state: counts, years, dollars, names, dates, and yes/no answers. */
export type FieldValue = string | number | boolean;
export type FieldCandidate<T extends FieldValue = number> = { source: string; kind: SourceKind; value: T | null; quote?: string | null };
export type ResolvedCandidate<T extends FieldValue = number> = { source: string; value: T; quote?: string };
export type Resolved<T extends FieldValue = number> = {
  value: T | null;
  source: string;
  confidence: number;
  conflict: string | null;
  /** The verbatim sentence a backer of the winning value took it from, when one supplied it. */
  quote: string | null;
  /** Every source that stated a value, in trust order, so a disagreement can be shown next to the fact. */
  candidates: ResolvedCandidate<T>[];
};

const describe = <T extends FieldValue>(candidates: FieldCandidate<T>[]) => candidates.map((candidate) => `${candidate.source} ${candidate.value}`).join(", ");
const listed = <T extends FieldValue>(candidates: FieldCandidate<T>[]): ResolvedCandidate<T>[] =>
  candidates.map((candidate) => (candidate.quote ? { source: candidate.source, value: candidate.value as T, quote: candidate.quote } : { source: candidate.source, value: candidate.value as T }));

/**
 * Resolves one fact from several sources. The underwriter's intake wins
 * outright; otherwise the value with the most independent support wins and
 * confidence reflects that support. Disagreement is always reported so the
 * reviewer sees it, even when the intake settles the value. The quote follows
 * the winning value: it only ever comes from a source that stated that value.
 */
export function resolveField<T extends FieldValue = number>(label: string, candidates: FieldCandidate<T>[]): Resolved<T> {
  const stated = candidates.filter((candidate) => candidate.value !== null);
  const distinct = [...new Set(stated.map((candidate) => candidate.value))];
  const conflict = distinct.length > 1 ? `${label} differs: ${describe(stated)}.` : null;
  const quoteFrom = (backers: FieldCandidate<T>[]) => backers.find((candidate) => candidate.quote)?.quote ?? null;
  const intake = stated.find((candidate) => candidate.kind === "intake");
  if (intake) return { value: intake.value, source: intake.source, confidence: 1, conflict, quote: quoteFrom(stated.filter((candidate) => candidate.value === intake.value)), candidates: listed(stated) };
  if (!stated.length) return { value: null, source: "Not provided", confidence: 0, conflict: null, quote: null, candidates: [] };

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
  return { value: winner.value, source: lead.source, confidence, conflict, quote: quoteFrom(winner.backers), candidates: listed(stated) };
}
