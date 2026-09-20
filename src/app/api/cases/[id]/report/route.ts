import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedSession } from "@/lib/auth-access";
import { db } from "@/lib/db";
import type { ReportDraft } from "@/lib/types";

export const runtime = "nodejs";

const reportSchema = z.object({
  analysisRevision: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  sections: z.array(z.object({
    id: z.string().min(1).max(80),
    title: z.string().trim().min(1).max(120),
    body: z.string().max(30_000),
  })).max(30),
}).refine((report) => new Set(report.sections.map((section) => section.id)).size === report.sections.length, {
  message: "Report sections must have distinct IDs.",
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedSession(request.headers);
  if (!session) return NextResponse.json({ error: "Sign in to access this workspace." }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Use the case page on this site." }, { status: 403 });
  }
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid case ID." }, { status: 400 });
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Review the report sections and try again." }, { status: 400 });
  const { analysisRevision, version, sections } = parsed.data;
  const draft: ReportDraft | null = sections.length ? {
    sections, analysisRevision, editedBy: session.user.email, updatedAt: new Date().toISOString(),
  } : null;

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT status, analysis_revision, report_draft_version FROM cases WHERE id = $1 FOR UPDATE", [id],
    );
    const current = found.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Case not found." }, { status: 404 });
    }
    if (["received", "extracting", "checking"].includes(current.status)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Wait for the agent to finish before editing its report." }, { status: 409 });
    }
    if (current.analysis_revision !== analysisRevision || current.report_draft_version !== version) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "The report changed while you were editing. Reload the case to review the latest version." }, { status: 409 });
    }
    await client.query(
      "UPDATE cases SET report_draft = $2, report_draft_version = report_draft_version + 1, updated_at = now() WHERE id = $1",
      [id, draft ? JSON.stringify(draft) : null],
    );
    await client.query(
      "INSERT INTO audit_events (case_id, event_type, detail) VALUES ($1, $2, $3)",
      [id, draft ? "report_draft_saved" : "report_draft_restored", JSON.stringify({ editedBy: session.user.email, analysisRevision, sectionCount: sections.length })],
    );
    await client.query("COMMIT");
    return NextResponse.json({ draft, version: version + 1 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return NextResponse.json({ error: "Could not save the report. Try again." }, { status: 503 });
  } finally {
    client.release();
  }
}
