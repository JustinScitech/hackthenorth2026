import { liveConfiguration } from "@/federato/config";
import { latestTriageReport, saveTriageReport } from "@/federato/reports";
import { runTriage } from "@/federato/triage";
import { requireApiSession } from "@/lib/auth-access";
import { createEventStream } from "@/lib/review-stream-server";
import type { ReviewStreamEvent } from "@/lib/review-stream";
import { signReviewItem } from "@/federato/review-signature";
import type { StoredTriageReport } from "@/federato/reports";

export const runtime = "nodejs";
export const maxDuration = 300;
const noStore = { "Cache-Control": "no-store" };

function withChatSignatures(report: StoredTriageReport) {
  const age = Date.now() - Date.parse(report.generatedAt);
  const recent = Number.isFinite(age) && age >= -60_000 && age <= 24 * 60 * 60 * 1000;
  return { ...report, chatSignatures: recent ? Object.fromEntries(report.ranked.map((item) => [item.id, signReviewItem(report.resource, report.generatedAt, item)])) : {} };
}

async function rankQueue(progress?: Parameters<typeof runTriage>[2], signal?: AbortSignal) {
  const { client, options } = liveConfiguration();
  const { schema: _schema, ...result } = await runTriage(client, { ...options, signal }, progress);
  signal?.throwIfAborted();
  try { await saveTriageReport(result); }
  catch (error) { console.warn("Ranked queue was served without being saved", error instanceof Error ? error.name : "UnknownError"); }
  return withChatSignatures(result);
}

/** The most recent ranked queue, so the page and the overview open with it instead of waiting on a fresh run. */
export async function GET(request: Request) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  try {
    const report = await latestTriageReport();
    return Response.json({ report: report ? withChatSignatures(report) : null }, { headers: noStore });
  } catch (error) {
    console.error(error);
    return Response.json({ report: null }, { headers: noStore });
  }
}

export async function POST(request: Request) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "Use the queue page on this site." }, { status: 403 });
  if (request.headers.get("accept")?.includes("text/event-stream")) {
    return createEventStream<ReviewStreamEvent<unknown>>(async (emit, signal) => {
      try { emit({ type: "result", data: await rankQueue((data) => emit({ type: "progress", data }), signal) }); }
      catch (error) { emit({ type: "error", data: { error: error instanceof Error ? error.message : "Federato triage failed." } }); }
    }, request.signal);
  }
  try {
    return Response.json(await rankQueue(undefined, request.signal), { headers: noStore });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Federato triage failed." }, { status: 502, headers: noStore });
  }
}
