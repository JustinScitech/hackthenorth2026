import { Pool } from "pg";
import type { AuditEvent, CaseRecord } from "./types";

const globalForDb = globalThis as unknown as { dbPool?: Pool };

/**
 * Creates the pool on first use rather than at import time. `next build` imports every
 * route module to collect page data, and that must not require a live DATABASE_URL.
 */
function pool(): Pool {
  if (globalForDb.dbPool) return globalForDb.dbPool;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const created = new Pool({ connectionString: process.env.DATABASE_URL });
  globalForDb.dbPool = created;
  return created;
}

/**
 * Pool-shaped proxy: `"connect" in db` and friends answer from Pool.prototype without
 * touching the environment, while any property read forwards to the real pool.
 */
export const db: Pool = new Proxy(Pool.prototype, {
  get(_target, property) {
    const real = pool();
    const value = Reflect.get(real, property, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
  set(_target, property, value) {
    return Reflect.set(pool(), property, value);
  },
}) as Pool;

function mapCase(row: Record<string, unknown>): CaseRecord {
  return {
    id: String(row.id), insuredName: String(row.insured_name), state: String(row.state),
    tiv: Number(row.tiv), yearBuilt: row.year_built === null ? null : Number(row.year_built),
    losses: row.losses === null ? null : Number(row.losses), sourceKey: String(row.source_key),
    publicSourceUrl: row.public_source_url as string | null,
    publicEvidence: row.public_evidence as CaseRecord["publicEvidence"],
    extractionConflicts: (row.extraction_conflicts as string[] | null) ?? [],
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
