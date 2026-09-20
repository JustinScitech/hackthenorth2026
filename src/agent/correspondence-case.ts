import type { RankedSubmission } from "../federato/scoring";
import { addAudit, db } from "../lib/db";
import { getText } from "../lib/storage";
import type { CaseRecord, Finding } from "../lib/types";
import { BROKER_UPDATE_SEPARATOR } from "./analysis";
import { draftBrokerEmail } from "./correspondence";
import { captureAgentError, logAgentEvent } from "./monitoring";

/**
 * The case side of broker correspondence: what checkCase calls. Drafts (or clears) the broker
 * email when the check pauses the case. Model trouble is recorded in the audit trail and never
 * fails the job.
 */

/** The submission and every processed reply, in order, so the draft can cite the broker's own words. */
async function loadCaseNotes(caseId: string, sourceKey: string): Promise<string> {
  const rows = await db.query("SELECT source_key FROM case_actions WHERE case_id = $1 AND kind = 'broker_response' AND processed_at IS NOT NULL ORDER BY created_at", [caseId]);
  const texts = await Promise.all([sourceKey, ...rows.rows.map((row) => String(row.source_key))].map(getText));
  return texts.join(BROKER_UPDATE_SEPARATOR);
}

/**
 * Stores the email for this analysis revision as pending the underwriter's approval, or clears it
 * when nothing is missing. A previous revision's draft is replaced: each pause asks its own question.
 */
export async function draftCaseEmail(caseId: string, caseRecord: CaseRecord, result: { question: string | null; findings: Finding[]; appetiteResult: RankedSubmission }, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (!result.question) {
    await db.query("UPDATE cases SET draft_email = NULL, draft_status = NULL WHERE id = $1 AND status <> 'stopped'", [caseId]);
    return;
  }
  let notes = "";
  try {
    notes = await loadCaseNotes(caseId, caseRecord.sourceKey);
  } catch (error) {
    captureAgentError(error);
  }
  const missing = result.appetiteResult.missingData;
  const draft = await draftBrokerEmail({ ...caseRecord, notes }, missing, result.findings);
  signal?.throwIfAborted();
  const saved = await db.query("UPDATE cases SET draft_email = $2, draft_status = 'pending', updated_at = now() WHERE id = $1 AND status <> 'stopped' RETURNING id", [caseId, draft.text]);
  if (!saved.rowCount) throw new DOMException("Case analysis stopped", "AbortError");
  await addAudit(caseId, "broker_email_drafted", {
    revision: caseRecord.analysisRevision, source: draft.source, model: draft.model, durationMs: draft.durationMs, fallbackReason: draft.fallbackReason, missing,
  }, `draft:${caseId}:${caseRecord.analysisRevision}`);
  logAgentEvent("broker_email_drafted", { caseId, revision: caseRecord.analysisRevision, source: draft.source, missing: missing.length });
}
