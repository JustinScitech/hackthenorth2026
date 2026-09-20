import type { SimilarCasesResult } from "@/agent/similar-cases";

const nothing = (reason: string): SimilarCasesResult => ({ path: "failed", cases: [], summary: null, reason });

/** Fetches the precedent for a case. Any failure reads as "nothing to show", so the section simply stays hidden. */
export async function loadSimilarCases(id: string, fetcher: typeof fetch = fetch): Promise<SimilarCasesResult> {
  try {
    const response = await fetcher(`/api/cases/${id}/similar`, { cache: "no-store" });
    if (!response.ok) return nothing(`HTTP ${response.status}`);
    const payload = await response.json().catch(() => null) as Partial<SimilarCasesResult> | null;
    if (!payload || !Array.isArray(payload.cases)) return nothing("malformed response");
    return {
      path: payload.path ?? "failed", cases: payload.cases,
      summary: typeof payload.summary === "string" ? payload.summary : null,
      ...(typeof payload.reason === "string" ? { reason: payload.reason } : {}),
    };
  } catch (error) {
    return nothing(error instanceof Error ? error.name : "unknown error");
  }
}
