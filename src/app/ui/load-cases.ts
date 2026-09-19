import type { CaseRecord } from "@/lib/types";

/** Read the case API without exposing raw response parsing errors to the UI. */
export async function loadCases(fetcher: typeof fetch = fetch): Promise<CaseRecord[]> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher("/api/cases", { cache: "no-store" });
    } catch {
      throw new Error("Could not reach the case API. Check your connection and refresh.");
    }

    let body: string;
    try {
      body = await response.text();
    } catch {
      if (attempt === 0) continue;
      throw new Error("The case API response was interrupted. Refresh to try again.");
    }

    if (!body.trim()) {
      if (attempt === 0) continue;
      throw new Error(`The case API returned an empty response (HTTP ${response.status}). Refresh to try again.`);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      if (attempt === 0) continue;
      throw new Error(`The case API returned an invalid response (HTTP ${response.status}). Refresh to try again.`);
    }

    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Could not load cases (HTTP ${response.status}).`;
      throw new Error(message);
    }

    if (!payload || typeof payload !== "object" || !("cases" in payload) || !Array.isArray(payload.cases)) {
      throw new Error("The case API returned an invalid case list. Refresh to try again.");
    }
    return payload.cases as CaseRecord[];
  }

  throw new Error("Could not load cases.");
}
