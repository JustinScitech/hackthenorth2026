import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { addAudit, db, listCases } from "@/lib/db";
import { putText } from "@/lib/storage";
import { TASK_QUEUE, temporalClient } from "@/lib/temporal";

const createSchema = z.object({
  insuredName: z.string().trim().min(2).max(160),
  state: z.string().trim().toUpperCase().length(2),
  tiv: z.number().positive().max(1_000_000_000),
  yearBuilt: z.number().int().min(1800).max(new Date().getFullYear()).nullable(),
  losses: z.number().int().min(0).max(1000).nullable(),
  brokerNotes: z.string().trim().min(10).max(20_000),
});

export async function GET() {
  try {
    return NextResponse.json({ cases: await listCases() });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Cases are unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the submission fields and try again." }, { status: 400 });

  const id = randomUUID();
  const sourceKey = `cases/${id}/submission.txt`;
  try {
    await putText(sourceKey, parsed.data.brokerNotes);
    await db.query(
      "INSERT INTO cases (id, insured_name, state, tiv, year_built, losses, source_key) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [id, parsed.data.insuredName, parsed.data.state, parsed.data.tiv, parsed.data.yearBuilt, parsed.data.losses, sourceKey],
    );
    await addAudit(id, "case_created", { source: "intake_form" }, `created:${id}`);
    const temporal = await temporalClient();
    await temporal.workflow.start("underwritingCase", { workflowId: id, taskQueue: TASK_QUEUE, args: [id] });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error(error);
    await db.query("UPDATE cases SET status = 'failed', error = 'Unable to start workflow', updated_at = now() WHERE id = $1", [id]).catch(() => {});
    return NextResponse.json({ error: "Could not start this case. Check local services and worker." }, { status: 503 });
  }
}
