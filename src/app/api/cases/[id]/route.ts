import { NextResponse } from "next/server";
import { caseJobStatus } from "@/agent/job-queue";
import { getAudit, getCase } from "@/lib/db";
import { requireApiSession } from "@/lib/auth-access";
import { createEventStream } from "@/lib/review-stream-server";
import type { ReviewStreamEvent } from "@/lib/review-stream";

export const runtime = "nodejs";
export const maxDuration = 60;

async function payload(id: string) {
  const caseRecord = await getCase(id);
  if (!caseRecord) return null;
  const [audit, jobStatus] = await Promise.all([getAudit(id), caseJobStatus(id)]);
  return { case: caseRecord, audit, jobStatus, voiceAvailable: Boolean(process.env.ELEVENLABS_API_KEY) };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid case ID." }, { status: 400 });
  try {
    const initial = await payload(id);
    if (!initial) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    if (!request.headers.get("accept")?.includes("text/event-stream")) return NextResponse.json(initial, { headers: { "Cache-Control": "no-store" } });
    return createEventStream<ReviewStreamEvent<NonNullable<typeof initial>>>(async (emit, signal) => {
      let last = "";
      try {
        for (let tick = 0; tick < 55 && !signal.aborted; tick += 1) {
          const current = tick === 0 ? initial : await payload(id);
          if (!current) break;
          const serialized = JSON.stringify(current);
          if (serialized !== last) {
            emit({ type: "result", data: current });
            last = serialized;
          } else if (tick % 15 === 0) emit({ type: "progress", data: { stage: "heartbeat", message: "Waiting for case changes" } });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error("Case stream unavailable", error);
        if (!signal.aborted) emit({ type: "error", data: { error: "Case activity is unavailable. Reconnecting…" } });
      }
    }, request.signal);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Case is unavailable." }, { status: 503 });
  }
}
