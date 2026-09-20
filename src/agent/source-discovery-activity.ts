import { addAudit, db } from "../lib/db";
import type { CaseRecord } from "../lib/types";
import { captureAgentError, logAgentEvent } from "./monitoring";
import { discoverPublicSources, type SearchFetcher, type SourceCandidate } from "./source-discovery";

/**
 * The research step for a case that arrived without a public source URL: run
 * discovery once, save the ranked candidates on the case, and leave the choice
 * to the underwriter. Nothing here throws into the job; a failed search is an
 * audit entry and the picker simply offers a manual URL field.
 */
export async function discoverCaseSources(caseRecord: CaseRecord, search?: SearchFetcher): Promise<SourceCandidate[]> {
  const caseId = caseRecord.id;
  if (caseRecord.sourceCandidates) return caseRecord.sourceCandidates;
  if (!process.env.BROWSERBASE_API_KEY) {
    await addAudit(caseId, "public_research_skipped", { reason: "No public source URL supplied and Browserbase is not configured for discovery" }, `research-skipped:${caseId}`);
    return [];
  }
  await addAudit(caseId, "source_discovery_started", { insuredName: caseRecord.insuredName, state: caseRecord.state }, `discovery-started:${caseId}`);
  try {
    const candidates = await discoverPublicSources({ insuredName: caseRecord.insuredName, state: caseRecord.state, address: caseRecord.address }, search);
    await db.query("UPDATE cases SET source_candidates = $2, updated_at = now() WHERE id = $1", [caseId, JSON.stringify(candidates)]);
    await addAudit(caseId, "source_discovery_completed", { candidates: candidates.map(({ url, confidence }) => ({ url, confidence })) }, `discovery:${caseId}`);
    logAgentEvent("source_discovery_completed", { caseId, candidates: candidates.length });
    return candidates;
  } catch (error) {
    captureAgentError(error, { where: "source_discovery" });
    await db.query("UPDATE cases SET source_candidates = '[]'::jsonb, updated_at = now() WHERE id = $1", [caseId]);
    await addAudit(caseId, "source_discovery_failed", { reason: error instanceof Error ? error.message.slice(0, 160) : "Unknown error" }, `discovery-failed:${caseId}`);
    return [];
  }
}
