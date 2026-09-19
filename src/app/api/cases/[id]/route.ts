import { NextResponse } from "next/server";
import { caseJobStatus } from "@/agent/jobs";
import { getAudit, getCase } from "@/lib/db";
import { requireApiSession } from "@/lib/auth-access";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid case ID." }, { status: 400 });
  try {
    const caseRecord = await getCase(id);
    if (!caseRecord) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    const [audit, jobStatus] = await Promise.all([getAudit(id), caseJobStatus(id)]);
    return NextResponse.json({ case: caseRecord, audit, jobStatus, voiceAvailable: Boolean(process.env.ELEVENLABS_API_KEY) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Case is unavailable." }, { status: 503 });
  }
}
