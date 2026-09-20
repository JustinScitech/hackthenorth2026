import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth-access";
import { getAudit, getCase } from "@/lib/db";
import { createCaseReportPdf, type ReportConversationTurn } from "@/lib/case-report";

export const runtime = "nodejs";

const conversationSchema = z.array(z.object({
  role: z.enum(["you", "agent"]), text: z.string().min(1).max(4000),
})).max(40);

async function renderReport(id: string, conversation: ReportConversationTurn[] = []) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid case ID." }, { status: 400 });

  try {
    const caseRecord = await getCase(id);
    if (!caseRecord) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    const audit = await getAudit(id);
    const pdf = await createCaseReportPdf(caseRecord, audit, conversation);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="case-${id.slice(0, 8)}-underwriting-report.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Case report is unavailable." }, { status: 503 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const { id } = await context.params;
  return renderReport(id);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Use the case page on this site." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const parsed = conversationSchema.safeParse(body?.conversation);
  if (!parsed.success) return NextResponse.json({ error: "Invalid conversation." }, { status: 400 });
  const { id } = await context.params;
  return renderReport(id, parsed.data);
}
