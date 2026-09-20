import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/auth-access";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "Use the case page on this site." }, { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid case ID." }, { status: 400 });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const changed = await client.query(
      `UPDATE cases SET status = 'stopped', updated_at = now()
       WHERE id = $1 AND status IN ('received', 'extracting', 'checking', 'waiting_for_broker') RETURNING id`, [id],
    );
    if (!changed.rowCount) {
      const current = await client.query("SELECT status FROM cases WHERE id = $1", [id]);
      await client.query("ROLLBACK");
      if (!current.rowCount) return Response.json({ error: "Case not found." }, { status: 404 });
      if (current.rows[0].status === "stopped") return Response.json({ ok: true, status: "stopped" });
      return Response.json({ error: "This analysis has already finished." }, { status: 409 });
    }
    await client.query(
      `UPDATE case_jobs SET status = 'cancelled', finished_at = now(), lease_until = NULL,
       lease_token = NULL, updated_at = now()
       WHERE case_id = $1 AND finished_at IS NULL`, [id],
    );
    await client.query(
      `INSERT INTO audit_events (case_id, event_type, event_key, detail)
       VALUES ($1, 'analysis_stopped', $2, '{}'::jsonb) ON CONFLICT (event_key) DO NOTHING`,
      [id, `stopped:${id}`],
    );
    await client.query("COMMIT");
    return Response.json({ ok: true, status: "stopped" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return Response.json({ error: "Could not stop the analysis. Try again." }, { status: 503 });
  } finally {
    client.release();
  }
}
