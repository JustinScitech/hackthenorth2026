import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthorizedSession } from "@/lib/auth-access";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * The underwriter's say over the agent's email to the broker. "edited" saves new wording and keeps
 * the draft open; "approved" is the send: the text is frozen and an audit event records who
 * approved it and whether they changed the agent's words. No email leaves the workspace.
 */
const draftSchema = z.object({
  analysisRevision: z.number().int().nonnegative(),
  status: z.enum(["approved", "edited"]),
  text: z.string().trim().min(3).max(10_000),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedSession(request.headers);
  if (!session) return NextResponse.json({ error: "Sign in to access this workspace." }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Use the case page on this site." }, { status: 403 });
  }
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid case ID." }, { status: 400 });
  const parsed = draftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write the email before approving or saving it." }, { status: 400 });
  const { analysisRevision, status, text } = parsed.data;

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT status, analysis_revision, draft_email, draft_status FROM cases WHERE id = $1 FOR UPDATE", [id]);
    const current = found.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Case not found." }, { status: 404 });
    }
    if (current.status !== "waiting_for_broker" || !current.draft_email) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This case is not waiting on a broker email." }, { status: 409 });
    }
    if (current.analysis_revision !== analysisRevision) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "The case moved on while you were editing. Reload it to see the latest draft." }, { status: 409 });
    }
    if (current.draft_status === "approved") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "This email was already approved and recorded as sent." }, { status: 409 });
    }
    const edited = current.draft_status === "edited" || text !== String(current.draft_email).trim();
    await client.query("UPDATE cases SET draft_email = $2, draft_status = $3, updated_at = now() WHERE id = $1", [id, text, status]);
    await client.query(
      "INSERT INTO audit_events (case_id, event_type, detail) VALUES ($1, $2, $3)",
      [id, status === "approved" ? "broker_email_approved" : "broker_email_edited", JSON.stringify({ by: session.user.email, analysisRevision, edited, length: text.length })],
    );
    await client.query("COMMIT");
    return NextResponse.json({ draftEmail: text, draftStatus: status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return NextResponse.json({ error: "Could not save the email. Try again." }, { status: 503 });
  } finally {
    client.release();
  }
}
