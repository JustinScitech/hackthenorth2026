import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { temporalClient } from "@/agent/client";
import { WORKFLOW_TYPE } from "@/agent/contracts";
import { TASK_QUEUE } from "@/agent/task-queue";
import { publicSourceUrl } from "@/agent/public-source-url";
import { addAudit, db, listCases } from "@/lib/db";
import { putText } from "@/lib/storage";
import { requireApiSession } from "@/lib/auth-access";

const createSchema = z.object({
  insuredName: z.string().trim().min(2).max(160),
  state: z.string().trim().toUpperCase().length(2),
  tiv: z.number().positive().max(1_000_000_000),
  yearBuilt: z.number().int().min(1800).max(new Date().getFullYear()).nullable(),
  losses: z.number().int().min(0).max(1000).nullable(),
  brokerNotes: z.string().trim().min(10).max(20_000),
  publicSourceUrl: z.url().max(2000).nullable(),
});

export async function GET(request: Request) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ cases: await listCases() });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Cases are unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "Use the case form on this site." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the submission fields and try again." }, { status: 400 });
  if (parsed.data.publicSourceUrl) {
    try { publicSourceUrl(parsed.data.publicSourceUrl); }
    catch { return NextResponse.json({ error: "Provide a public HTTPS source URL." }, { status: 400 }); }
  }

  const id = randomUUID();
  const sourceKey = `cases/${id}/submission.txt`;
  try {
    await putText(sourceKey, parsed.data.brokerNotes);
    await db.query(
      "INSERT INTO cases (id, insured_name, state, tiv, year_built, losses, source_key, public_source_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [id, parsed.data.insuredName, parsed.data.state, parsed.data.tiv, parsed.data.yearBuilt, parsed.data.losses, sourceKey, parsed.data.publicSourceUrl],
    );
    await addAudit(id, "case_created", { source: "intake_form", documentStore: "mongodb" }, `created:${id}`);
    const temporal = await temporalClient();
    await temporal.workflow.start(WORKFLOW_TYPE, { workflowId: id, taskQueue: TASK_QUEUE, args: [id] });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error(error);
    await db.query("UPDATE cases SET status = 'failed', error = 'Unable to start workflow', updated_at = now() WHERE id = $1", [id]).catch(() => {});
    return NextResponse.json({ error: "Could not start this case. Check local services and worker." }, { status: 503 });
  }
}
