import { buildFacts, evaluateFacts } from "../lib/analysis";
import { addAudit, db, getCase } from "../lib/db";
import { extractNotes } from "../lib/model";
import { getText } from "../lib/storage";
import type { Facts } from "../lib/types";

export async function extractCase(caseId: string): Promise<void> {
  const caseRecord = await getCase(caseId);
  if (!caseRecord) throw new Error(`Case ${caseId} not found`);
  await db.query("UPDATE cases SET status = 'extracting', error = NULL, updated_at = now() WHERE id = $1", [caseId]);
  const responseRows = await db.query(
    "SELECT source_key FROM case_actions WHERE case_id = $1 AND kind = 'broker_response' AND processed_at IS NOT NULL ORDER BY created_at",
    [caseId],
  );
  const texts = await Promise.all([caseRecord.sourceKey, ...responseRows.rows.map((row) => String(row.source_key))].map(getText));
  const extracted = await extractNotes(texts.join("\n\n"));
  const facts = buildFacts(caseRecord, extracted);
  await db.query("UPDATE cases SET facts = $2, updated_at = now() WHERE id = $1", [caseId, JSON.stringify(facts)]);
}

export async function checkCase(caseId: string): Promise<{ needsBroker: boolean }> {
  const caseRecord = await getCase(caseId);
  if (!caseRecord?.facts) throw new Error(`Extracted facts missing for ${caseId}`);
  await db.query("UPDATE cases SET status = 'checking', updated_at = now() WHERE id = $1", [caseId]);
  const result = evaluateFacts(caseRecord.facts as Facts);
  const status = result.question ? "waiting_for_broker" : "review_ready";
  await db.query(
    "UPDATE cases SET status = $2, findings = $3, question = $4, brief = $5, updated_at = now() WHERE id = $1",
    [caseId, status, JSON.stringify(result.findings), result.question, result.brief],
  );
  await addAudit(caseId, "analysis_completed", { revision: caseRecord.analysisRevision, status }, `analysis:${caseId}:${caseRecord.analysisRevision}`);
  return { needsBroker: Boolean(result.question) };
}

export async function recordBrokerResponse(caseId: string, actionId: string): Promise<boolean> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const action = await client.query(
      "SELECT * FROM case_actions WHERE id = $1 AND case_id = $2 FOR UPDATE",
      [actionId, caseId],
    );
    if (!action.rows[0] || action.rows[0].kind !== "broker_response") throw new Error("Invalid broker response action");
    if (action.rows[0].processed_at) { await client.query("COMMIT"); return false; }
    await client.query("UPDATE case_actions SET processed_at = now() WHERE id = $1", [actionId]);
    await client.query("UPDATE cases SET analysis_revision = analysis_revision + 1, updated_at = now() WHERE id = $1", [caseId]);
    await client.query(
      "INSERT INTO audit_events (case_id, event_type, event_key, detail) VALUES ($1, 'broker_response_received', $2, $3) ON CONFLICT (event_key) DO NOTHING",
      [caseId, `action:${actionId}`, JSON.stringify({ actionId })],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function recordBrokerFollowUp(caseId: string, reminderNumber: number): Promise<void> {
  await addAudit(
    caseId,
    "broker_follow_up_due",
    { reminderNumber },
    `followup:${caseId}:${reminderNumber}`,
  );
}

export async function finalizeDecision(caseId: string, actionId: string): Promise<void> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const action = await client.query("SELECT * FROM case_actions WHERE id = $1 AND case_id = $2 FOR UPDATE", [actionId, caseId]);
    if (!action.rows[0] || !["approve", "decline"].includes(action.rows[0].kind)) throw new Error("Invalid review action");
    if (action.rows[0].processed_at) { await client.query("COMMIT"); return; }
    const status = action.rows[0].kind === "approve" ? "approved" : "declined";
    const updated = await client.query(
      "UPDATE cases SET status = $2, decision = $3, updated_at = now() WHERE id = $1 AND status = 'review_ready' RETURNING id",
      [caseId, status, action.rows[0].reason],
    );
    if (!updated.rowCount) throw new Error("Case is not ready for review");
    await client.query("UPDATE case_actions SET processed_at = now() WHERE id = $1", [actionId]);
    await client.query(
      "INSERT INTO audit_events (case_id, event_type, event_key, detail) VALUES ($1, $2, $3, $4) ON CONFLICT (event_key) DO NOTHING",
      [caseId, status, `action:${actionId}`, JSON.stringify({ actionId, reason: action.rows[0].reason })],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function failCase(caseId: string, reason: string): Promise<void> {
  await db.query("UPDATE cases SET status = 'failed', error = $2, updated_at = now() WHERE id = $1", [caseId, reason.slice(0, 500)]);
  await addAudit(caseId, "workflow_failed", { reason: reason.slice(0, 500) }, `failed:${caseId}`);
}
