import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { addAudit, db, getCase } from "../lib/db";
import * as activityModule from "./activities";
import { monitorActivities, recordJobMetrics, startAgentSpan } from "./monitoring";

export type JobKind = "analyze" | "broker_response" | "decision" | "broker_follow_up";
type JobPayload = { actionId?: string; revision?: number; reminderNumber?: number };
type Job = { id: string; case_id: string; kind: JobKind; payload: JobPayload; attempts: number; lease_token: string };

const MAX_ATTEMPTS = 3;
const LEASE_SECONDS = 900;
const FOLLOW_UP_HOURS = 24;

// Each activity becomes an `agent.activity` span when SENTRY_DSN is set; otherwise these are the plain functions.
const { checkCase, extractCase, failCase, finalizeDecision, recordBrokerFollowUp, recordBrokerResponse, researchPublicSource } = monitorActivities(activityModule);

export async function enqueueJob(caseId: string, kind: JobKind, key: string, payload: JobPayload = {}, runAt = new Date(), client?: PoolClient) {
  await (client ?? db).query(
    `INSERT INTO case_jobs (id, case_id, kind, job_key, payload, run_at)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (job_key) DO NOTHING`,
    [randomUUID(), caseId, kind, key, JSON.stringify(payload), runAt],
  );
}

export async function caseJobStatus(caseId: string): Promise<"QUEUED" | "RUNNING" | "WAITING" | "COMPLETED" | "FAILED"> {
  const result = await db.query(
    `SELECT status, kind, lease_until FROM case_jobs WHERE case_id = $1 AND finished_at IS NULL
     ORDER BY created_at DESC LIMIT 1`, [caseId],
  );
  const row = result.rows[0];
  if (row) {
    if (row.status === "running" && new Date(row.lease_until).getTime() > Date.now()) return "RUNNING";
    if (row.kind !== "broker_follow_up") return "QUEUED";
  }
  const record = await getCase(caseId);
  if (record?.status === "failed") return "FAILED";
  if (record?.status === "approved" || record?.status === "declined") return "COMPLETED";
  return "WAITING";
}

async function scheduleFollowUp(caseId: string) {
  const record = await getCase(caseId);
  if (record?.status !== "waiting_for_broker") return;
  await enqueueJob(caseId, "broker_follow_up", `followup:${caseId}:${record.analysisRevision}:1`,
    { revision: record.analysisRevision, reminderNumber: 1 }, new Date(Date.now() + FOLLOW_UP_HOURS * 3_600_000));
}

async function runJob(job: Job) {
  const record = await getCase(job.case_id);
  if (!record || ["approved", "declined", "failed"].includes(record.status)) return;
  if (job.kind === "analyze") {
    if (record.status === "waiting_for_broker") { await scheduleFollowUp(job.case_id); return; }
    if (!["received", "extracting", "checking"].includes(record.status)) return;
    await extractCase(job.case_id);
    await researchPublicSource(job.case_id);
    await checkCase(job.case_id);
    await scheduleFollowUp(job.case_id);
  } else if (job.kind === "broker_response") {
    if (!job.payload.actionId) throw new Error("Missing broker action ID");
    if (!["waiting_for_broker", "review_ready", "extracting", "checking"].includes(record.status)) return;
    await recordBrokerResponse(job.case_id, job.payload.actionId);
    await extractCase(job.case_id);
    await checkCase(job.case_id);
    await scheduleFollowUp(job.case_id);
  } else if (job.kind === "decision") {
    if (!job.payload.actionId) throw new Error("Missing decision action ID");
    if (record.status === "review_ready") await finalizeDecision(job.case_id, job.payload.actionId);
  } else {
    const { revision, reminderNumber } = job.payload;
    if (record.status !== "waiting_for_broker" || record.analysisRevision !== revision || !reminderNumber) return;
    await recordBrokerFollowUp(job.case_id, revision, reminderNumber);
    await enqueueJob(job.case_id, "broker_follow_up", `followup:${job.case_id}:${revision}:${reminderNumber + 1}`,
      { revision, reminderNumber: reminderNumber + 1 }, new Date(Date.now() + FOLLOW_UP_HOURS * 3_600_000));
  }
}

export async function processNextJob(): Promise<boolean> {
  const token = randomUUID();
  const claimed = await db.query<Job>(
    `UPDATE case_jobs SET status = 'running', attempts = attempts + 1,
       lease_token = $1, lease_until = now() + ($2 * interval '1 second'), updated_at = now()
     WHERE id = (SELECT id FROM case_jobs
       WHERE finished_at IS NULL AND run_at <= now()
         AND (status = 'queued' OR (status = 'running' AND lease_until < now()))
       ORDER BY run_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING id, case_id, kind, payload, attempts, lease_token`, [token, LEASE_SECONDS],
  );
  const job = claimed.rows[0];
  if (!job) return false;
  const startedAt = Date.now();
  const heartbeat = setInterval(() => {
    void db.query(`UPDATE case_jobs SET lease_until = now() + ($3 * interval '1 second')
      WHERE id = $1 AND lease_token = $2 AND finished_at IS NULL`, [job.id, token, LEASE_SECONDS]).catch(console.error);
  }, 30_000);
  try {
    await startAgentSpan(`underwriting.job.${job.kind}`, "agent.job", { "job.kind": job.kind, "job.attempt": job.attempts, "case.id": job.case_id }, () => runJob(job));
    await db.query("UPDATE case_jobs SET status = 'completed', finished_at = now(), lease_token = NULL, updated_at = now() WHERE id = $1 AND lease_token = $2", [job.id, token]);
    recordJobMetrics(job.kind, "completed", Date.now() - startedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const exhausted = job.attempts >= MAX_ATTEMPTS;
    await db.query(
      `UPDATE case_jobs SET status = $3, finished_at = CASE WHEN $4 THEN now() ELSE NULL END,
       run_at = CASE WHEN $4 THEN run_at ELSE now() + (power(2, attempts) * interval '2 seconds') END,
       lease_token = NULL, last_error = $5, updated_at = now()
       WHERE id = $1 AND lease_token = $2`, [job.id, token, exhausted ? "failed" : "queued", exhausted, message.slice(0, 500)],
    );
    await addAudit(job.case_id, "job_retry", { kind: job.kind, attempt: job.attempts, exhausted, reason: message.slice(0, 160) }, `job-retry:${job.id}:${job.attempts}`);
    if (exhausted && job.kind !== "broker_follow_up") await failCase(job.case_id, message);
    recordJobMetrics(job.kind, exhausted ? "failed" : "retried", Date.now() - startedAt);
    console.error("Case job failed", job.id, message);
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}
