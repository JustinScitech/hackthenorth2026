import { NextResponse } from "next/server";
import { getAudit, getCase } from "@/lib/db";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid case ID." }, { status: 400 });
  try {
    const caseRecord = await getCase(id);
    if (!caseRecord) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    return NextResponse.json({ case: caseRecord, audit: await getAudit(id), voiceAvailable: Boolean(process.env.ELEVENLABS_API_KEY) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Case is unavailable." }, { status: 503 });
  }
}
