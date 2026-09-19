import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob } from "@/agent/jobs";
import { db, getCase } from "@/lib/db";
import { putText } from "@/lib/storage";
import { requireApiSession } from "@/lib/auth-access";
import { drainJobsAfterResponse } from "@/lib/inline-jobs";

// Long enough for the after() drain to finish an extraction on Vercel; see lib/inline-jobs.ts.
export const maxDuration = 300;

const actionSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.uuid(), kind: z.literal("broker_response"), response: z.string().trim().min(3).max(10_000) }),
  z.object({ id: z.uuid(), kind: z.enum(["approve", "decline"]), reason: z.string().trim().min(3).max(2000) }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "Use the case page on this site." }, { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid case ID." }, { status: 400 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Complete the response or review reason." }, { status: 400 });

  try {
    const caseRecord = await getCase(id);
    if (!caseRecord) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    const action = parsed.data;
    const sourceKey = action.kind === "broker_response"
      ? `cases/${id}/responses/${action.id}-${createHash("sha256").update(action.response).digest("hex")}.txt`
      : null;
    const reason = action.kind === "broker_response" ? null : action.reason;
    const existing = await db.query("SELECT case_id, kind, source_key, reason FROM case_actions WHERE id = $1", [action.id]);
    if (existing.rows[0]) {
      const saved = existing.rows[0];
      if (saved.case_id !== id || saved.kind !== action.kind || saved.source_key !== sourceKey || saved.reason !== reason) {
        return NextResponse.json({ error: "This action ID was already used for different content." }, { status: 409 });
      }
      await enqueueJob(id, action.kind === "broker_response" ? "broker_response" : "decision", `action:${action.id}`, { actionId: action.id });
      drainJobsAfterResponse();
      return NextResponse.json({ ok: true });
    }
    const expectedStatus = action.kind === "broker_response" ? "waiting_for_broker" : "review_ready";
    if (caseRecord.status !== expectedStatus) return NextResponse.json({ error: "This case has moved to another step. Refresh and try again." }, { status: 409 });

    if (sourceKey && action.kind === "broker_response") await putText(sourceKey, action.response);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const saved = await client.query(
        `INSERT INTO case_actions (id, case_id, kind, source_key, reason) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING RETURNING id`, [action.id, id, action.kind, sourceKey, reason],
      );
      if (!saved.rowCount) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "This action ID was already used for different content." }, { status: 409 });
      }
      await enqueueJob(id, action.kind === "broker_response" ? "broker_response" : "decision", `action:${action.id}`, { actionId: action.id }, new Date(), client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    drainJobsAfterResponse();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Action could not be delivered. You can retry it." }, { status: 503 });
  }
}
