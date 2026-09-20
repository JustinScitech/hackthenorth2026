import { BROKER_UPDATE_SEPARATOR, buildFacts, evaluateFacts } from "./analysis";
import { brokerAppetite, caseAppetiteSchema } from "../lib/case-appetite";
import { addAudit, db, getCase } from "../lib/db";
import { extractNotes } from "./model";
import { getText } from "../lib/storage";
import { putMongoEvidence } from "../lib/mongo";
import type { Facts } from "../lib/types";
import { captureAgentError, logAgentEvent, recordAnalysisMetrics, recordDecisionMetric, recordExtractionMetrics } from "./monitoring";
import { browsePublicSource } from "./public-source";
import { evidenceFindings } from "./enrichment";

export async function researchPublicSource(caseId: string): Promise<void> {
  const caseRecord = await getCase(caseId);
  if (!caseRecord) throw new Error(`Case ${caseId} not found`);
  if (!caseRecord.publicSourceUrl) {
    await addAudit(caseId, "public_research_skipped", { reason: "No public source URL supplied" }, `research-skipped:${caseId}`);
    return;
  }
  if (!process.env.BROWSERBASE_API_KEY) {
    await addAudit(caseId, "public_research_skipped", { reason: "Browserbase is not configured" }, `research-skipped:${caseId}`);
    return;
  }
  await addAudit(caseId, "public_research_started", {}, `research-started:${caseId}`);
  try {
    const evidence = await browsePublicSource(caseRecord.publicSourceUrl);
    await putMongoEvidence(caseId, evidence);
    await db.query("UPDATE cases SET public_evidence = $2, updated_at = now() WHERE id = $1", [caseId, JSON.stringify(evidence)]);
    await addAudit(caseId, "public_research_completed", { url: evidence.url, signals: (evidence.signals ?? []).map((signal) => signal.kind) }, `research:${caseId}`);
    logAgentEvent("public_research_completed", { caseId, signals: (evidence.signals ?? []).length });
  } catch (error) {
    captureAgentError(error);
    await addAudit(caseId, "public_research_failed", { reason: error instanceof Error ? error.message.slice(0, 160) : "Unknown error" }, `research-failed:${caseId}`);
  }
}

export async function extractCase(caseId: string): Promise<void> {
  const caseRecord = await getCase(caseId);
  if (!caseRecord) throw new Error(`Case ${caseId} not found`);
  await db.query("UPDATE cases SET status = 'extracting', error = NULL, updated_at = now() WHERE id = $1", [caseId]);
  await addAudit(caseId, "extraction_started", { revision: caseRecord.analysisRevision }, `extraction-started:${caseId}:${caseRecord.analysisRevision}`);
  const responseRows = await db.query(
    "SELECT source_key FROM case_actions WHERE case_id = $1 AND kind = 'broker_response' AND processed_at IS NOT NULL ORDER BY created_at",
    [caseId],
  );
  const texts = await Promise.all([caseRecord.sourceKey, ...responseRows.rows.map((row) => String(row.source_key))].map(getText));
  const providers = [process.env.GEMINI_API_KEY && "Gemini", process.env.OPENAI_API_KEY && "OpenAI"].filter(Boolean);
  if (providers.length) await addAudit(caseId, "model_extraction_started", { providers, revision: caseRecord.analysisRevision }, `model-started:${caseId}:${caseRecord.analysisRevision}`);
  const extraction = await extractNotes(texts.join(BROKER_UPDATE_SEPARATOR), async (event, attempt) => {
    const provider = attempt.source.toLowerCase();
    await addAudit(caseId, `${provider}_model_${event}`, {
      model: attempt.model, durationMs: attempt.durationMs, errorCode: attempt.errorCode,
      revision: caseRecord.analysisRevision,
    }, `${provider}:${event}:${caseId}:${caseRecord.analysisRevision}:${attempt.model}`);
  });
  const appetite = caseAppetiteSchema.parse({ ...brokerAppetite(texts[0]), ...caseRecord.appetite, ...brokerAppetite(texts.slice(1).join("\n")) });
  const facts = buildFacts({ ...caseRecord, appetite }, extraction.extracted);
  if (caseRecord.yearBuilt === null && facts.yearBuilt.value !== null) { facts.yearBuilt.source = `Broker text via ${extraction.fieldSources.yearBuilt}`; facts.yearBuilt.confidence = extraction.confidence.yearBuilt; }
  if (caseRecord.losses === null && facts.losses.value !== null) { facts.losses.source = `Broker text via ${extraction.fieldSources.losses}`; facts.losses.confidence = extraction.confidence.losses; }
  await db.query("UPDATE cases SET facts = $2, extraction_conflicts = $3, updated_at = now() WHERE id = $1", [caseId, JSON.stringify(facts), JSON.stringify(extraction.conflicts)]);
  await addAudit(caseId, "extraction_completed", {
    revision: caseRecord.analysisRevision,
    sources: extraction.sources,
    missing: Object.entries(facts).filter(([, fact]) => fact.value === null).map(([name]) => name),
    conflicts: extraction.conflicts.length,
    attempts: extraction.attempts.map(({ source, model, status, durationMs, errorCode, attemptCount }) => ({ source, model, status, durationMs, errorCode, attemptCount })),
    appliedSources: { yearBuilt: facts.yearBuilt.source, losses: facts.losses.source },
  }, `extraction:${caseId}:${caseRecord.analysisRevision}`);
  recordExtractionMetrics(extraction.attempts);
  logAgentEvent("extraction_completed", { caseId, revision: caseRecord.analysisRevision, conflicts: extraction.conflicts.length, models: extraction.attempts.filter((attempt) => attempt.status === "completed").map((attempt) => attempt.model) });
}

export async function checkCase(caseId: string): Promise<{ needsBroker: boolean }> {
  const caseRecord = await getCase(caseId);
  if (!caseRecord?.facts) throw new Error(`Extracted facts missing for ${caseId}`);
  await db.query("UPDATE cases SET status = 'checking', updated_at = now() WHERE id = $1", [caseId]);
  await addAudit(caseId, "guideline_check_started", { revision: caseRecord.analysisRevision }, `check-started:${caseId}:${caseRecord.analysisRevision}`);
  const result = evaluateFacts(caseRecord.facts as Facts);
  result.appetiteResult.id = caseId;
  for (const [index, conflict] of caseRecord.extractionConflicts.entries()) {
    result.findings.push({ id: `extraction_conflict_${index}`, label: "Extraction conflict", result: "refer", detail: conflict, source: "Independent extraction" });
  }
  if (caseRecord.extractionConflicts.length) result.brief += " Verify conflicting extraction results before deciding.";
  if (caseRecord.publicEvidence?.signals) {
    const evidence = evidenceFindings(caseRecord.facts as Facts, caseRecord.publicEvidence, caseRecord.publicEvidence.signals);
    result.findings.push(...evidence);
    if (evidence.some((finding) => finding.result === "refer")) result.brief += " The public source raises a point to verify before deciding.";
  }
  const status = result.question ? "waiting_for_broker" : "review_ready";
  await db.query(
    "UPDATE cases SET status = $2, findings = $3, question = $4, brief = $5, appetite_result = $6, updated_at = now() WHERE id = $1",
    [caseId, status, JSON.stringify(result.findings), result.question, result.brief, JSON.stringify(result.appetiteResult)],
  );
  await addAudit(caseId, "analysis_completed", {
    revision: caseRecord.analysisRevision, status,
    pass: result.findings.filter((finding) => finding.result === "pass").length,
    refer: result.findings.filter((finding) => finding.result === "refer").length,
    unknown: result.findings.filter((finding) => finding.result === "unknown").length,
  }, `analysis:${caseId}:${caseRecord.analysisRevision}`);
  recordAnalysisMetrics(result.findings, Boolean(result.question));
  logAgentEvent("analysis_completed", { caseId, revision: caseRecord.analysisRevision, status, refer: result.findings.filter((finding) => finding.result === "refer").length });
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

export async function recordBrokerFollowUp(caseId: string, revision: number, reminderNumber: number): Promise<void> {
  await addAudit(
    caseId,
    "broker_follow_up_due",
    { reminderNumber },
    `followup:${caseId}:${revision}:${reminderNumber}`,
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
    recordDecisionMetric(status);
    logAgentEvent("decision_recorded", { caseId, status });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function failCase(caseId: string, reason: string): Promise<void> {
  await db.query("UPDATE cases SET status = 'failed', error = $2, updated_at = now() WHERE id = $1", [caseId, reason.slice(0, 500)]);
  await addAudit(caseId, "job_failed", { reason: reason.slice(0, 500) }, `failed:${caseId}`);
}
