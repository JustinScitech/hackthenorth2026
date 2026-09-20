import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { db, getCase } from "../lib/db";

export type JobKind = "analyze" | "broker_response" | "decision" | "broker_follow_up";
export type JobPayload = { actionId?: string; revision?: number; reminderNumber?: number };

/**
 * `delayMs` is applied on the database clock (`now() + interval`), never from a JS Date: the worker
 * claims with `run_at <= now()`, so a run time stamped from a skewed app clock would sit in the
 * queue until the database caught up.
 */
export async function enqueueJob(caseId: string, kind: JobKind, key: string, payload: JobPayload = {}, delayMs = 0, client?: PoolClient) {
  await (client ?? db).query(
    `INSERT INTO case_jobs (id, case_id, kind, job_key, payload, run_at)
     VALUES ($1, $2, $3, $4, $5, now() + ($6 * interval '1 millisecond')) ON CONFLICT (job_key) DO NOTHING`,
    [randomUUID(), caseId, kind, key, JSON.stringify(payload), Math.max(0, Math.round(delayMs))],
  );
}

export async function caseJobStatus(caseId: string): Promise<"QUEUED" | "RUNNING" | "WAITING" | "COMPLETED" | "FAILED" | "STOPPED"> {
  const record = await getCase(caseId);
  if (record?.status === "stopped") return "STOPPED";
  const result = await db.query(
    `SELECT status, kind, (lease_until > now()) AS leased FROM case_jobs WHERE case_id = $1 AND finished_at IS NULL
     ORDER BY created_at DESC LIMIT 1`, [caseId],
  );
  const row = result.rows[0];
  if (row) {
    if (row.status === "running" && row.leased) return "RUNNING";
    if (row.kind !== "broker_follow_up") return "QUEUED";
  }
  if (record?.status === "failed") return "FAILED";
  if (record?.status === "approved" || record?.status === "declined") return "COMPLETED";
  return "WAITING";
}
