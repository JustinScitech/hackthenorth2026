export type SourceKind = "intake" | "model" | "parser";
export type FieldCandidate = { source: string; kind: SourceKind; value: number | null };
export type Resolved = { value: number | null; source: string; confidence: number; conflict: string | null };

/** Resolves one fact from several sources: the underwriter's intake wins, then agreement, then the strongest single source. */
export function resolveField(_label: string, _candidates: FieldCandidate[]): Resolved {
  throw new Error("resolveField is not implemented yet");
}
