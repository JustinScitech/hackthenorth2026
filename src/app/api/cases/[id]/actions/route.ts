import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, getCase } from "@/lib/db";
import { putText } from "@/lib/storage";
import { temporalClient } from "@/lib/temporal";

const actionSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.uuid(), kind: z.literal("broker_response"), response: z.string().trim().min(3).max(10_000) }),
  z.object({ id: z.uuid(), kind: z.enum(["approve", "decline"]), reason: z.string().trim().min(3).max(2000) }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid case ID." }, { status: 400 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Complete the response or review reason." }, { status: 400 });

  try {
    const caseRecord = await getCase(id);
    if (!caseRecord) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    const action = parsed.data;
    const expectedStatus = action.kind === "broker_response" ? "waiting_for_broker" : "review_ready";
    if (caseRecord.status !== expectedStatus) return NextResponse.json({ error: "This case has moved to another step. Refresh and try again." }, { status: 409 });

    let sourceKey: string | null = null;
    if (action.kind === "broker_response") {
      const contentHash = createHash("sha256").update(action.response).digest("hex");
      sourceKey = `cases/${id}/responses/${action.id}-${contentHash}.txt`;
      await putText(sourceKey, action.response);
    }
    const saved = await db.query(
      `INSERT INTO case_actions (id, case_id, kind, source_key, reason)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
       WHERE case_actions.case_id = EXCLUDED.case_id
         AND case_actions.kind = EXCLUDED.kind
         AND case_actions.source_key IS NOT DISTINCT FROM EXCLUDED.source_key
         AND case_actions.reason IS NOT DISTINCT FROM EXCLUDED.reason
       RETURNING id`,
      [action.id, id, action.kind, sourceKey, action.kind === "broker_response" ? null : action.reason],
    );
    if (!saved.rowCount) return NextResponse.json({ error: "This action ID was already used for different content." }, { status: 409 });
    const temporal = await temporalClient();
    const handle = temporal.workflow.getHandle(id);
    await handle.signal(action.kind === "broker_response" ? "brokerResponse" : "reviewDecision", action.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Action could not be delivered. You can retry it." }, { status: 503 });
  }
}
