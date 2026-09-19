import { Pool } from "pg";
import type { AuditEvent, CaseRecord } from "./types";

const globalForDb = globalThis as unknown as { dbPool?: Pool };
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
export const db = globalForDb.dbPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
});
if (process.env.NODE_ENV !== "production") globalForDb.dbPool = db;

function mapCase(row: Record<string, unknown>): CaseRecord {
  return {
    id: String(row.id), insuredName: String(row.insured_name), state: String(row.state),
    tiv: Number(row.tiv), yearBuilt: row.year_built === null ? null : Number(row.year_built),
    losses: row.losses === null ? null : Number(row.losses), sourceKey: String(row.source_key),
    status: row.status as CaseRecord["status"], facts: row.facts as CaseRecord["facts"],
    findings: row.findings as CaseRecord["findings"], brief: row.brief as string | null,
    question: row.question as string | null, decision: row.decision as string | null,
    error: row.error as string | null, analysisRevision: Number(row.analysis_revision),
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function getCase(id: string): Promise<CaseRecord | null> {
  const result = await db.query("SELECT * FROM cases WHERE id = $1", [id]);
  return result.rows[0] ? mapCase(result.rows[0]) : null;
}

export async function listCases(): Promise<CaseRecord[]> {
  const result = await db.query("SELECT * FROM cases ORDER BY created_at DESC LIMIT 50");
  return result.rows.map(mapCase);
}

export async function getAudit(id: string): Promise<AuditEvent[]> {
  const result = await db.query("SELECT id, event_type, detail, created_at FROM audit_events WHERE case_id = $1 ORDER BY id", [id]);
  return result.rows.map((row) => ({
    id: String(row.id), eventType: row.event_type,
    detail: row.detail, createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function addAudit(caseId: string, eventType: string, detail: Record<string, unknown> = {}, eventKey?: string) {
  await db.query(
    "INSERT INTO audit_events (case_id, event_type, event_key, detail) VALUES ($1, $2, $3, $4) ON CONFLICT (event_key) DO NOTHING",
    [caseId, eventType, eventKey ?? null, JSON.stringify(detail)],
  );
}
