import { NextResponse } from "next/server";
import { temporalClient } from "@/agent/client";
import { getAudit, getCase } from "@/lib/db";
import type { WorkflowStatus } from "@/lib/types";
import { requireApiSession } from "@/lib/auth-access";

async function getWorkflowStatus(id: string): Promise<WorkflowStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const description = await Promise.race([
      temporalClient().then((client) => client.workflow.getHandle(id).describe()),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Temporal status timed out")), 2000); }),
    ]);
    return description.status.name;
  } catch {
    return "UNAVAILABLE";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid case ID." }, { status: 400 });
  try {
    const caseRecord = await getCase(id);
    if (!caseRecord) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    const [audit, workflowStatus] = await Promise.all([getAudit(id), getWorkflowStatus(id)]);
    return NextResponse.json({ case: caseRecord, audit, workflowStatus, voiceAvailable: Boolean(process.env.ELEVENLABS_API_KEY) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Case is unavailable." }, { status: 503 });
  }
}
