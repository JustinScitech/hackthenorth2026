import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { db, getCase } from "../lib/db";

export type JobKind = "analyze" | "broker_response" | "decision" | "broker_follow_up";
export type JobPayload = { actionId?: string; revision?: number; reminderNumber?: number };

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
