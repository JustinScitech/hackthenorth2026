import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import type { TriageReport } from "./triage";

/** A ranked queue without the discovered schema: what the page shows and what the overview counts. */
export type StoredTriageReport = Omit<TriageReport, "schema">;

export async function saveTriageReport(report: StoredTriageReport): Promise<string> {
  const id = randomUUID();
  await db.query(
    "INSERT INTO triage_reports (id, resource, generated_at, total, evaluated, report) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, report.resource, report.generatedAt, report.total, report.evaluated, JSON.stringify(report)],
  );
  await db.query("DELETE FROM triage_reports WHERE id NOT IN (SELECT id FROM triage_reports ORDER BY generated_at DESC LIMIT 20)");
  return id;
}

export async function latestTriageReport(): Promise<StoredTriageReport | null> {
  const result = await db.query("SELECT report FROM triage_reports ORDER BY generated_at DESC LIMIT 1");
  return result.rows[0] ? (result.rows[0].report as StoredTriageReport) : null;
}
