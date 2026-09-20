import { liveConfiguration } from "@/federato/config";
import { latestTriageReport, saveTriageReport } from "@/federato/reports";
import { runTriage } from "@/federato/triage";
import { requireApiSession } from "@/lib/auth-access";
import { createEventStream } from "@/lib/review-stream-server";
import type { ReviewStreamEvent } from "@/lib/review-stream";
import { signReviewItem } from "@/federato/review-signature";

export const runtime = "nodejs";
export const maxDuration = 300;
const noStore = { "Cache-Control": "no-store" };

/** The most recent ranked queue, so the page and the overview open with it instead of waiting on a fresh run. */
export async function GET(request: Request) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  try {
    return Response.json({ report: await latestTriageReport() }, { headers: noStore });
  } catch (error) {
    console.error(error);
    return Response.json({ report: null }, { headers: noStore });
  }
}

export async function POST(request: Request) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "Use the triage page on this site." }, { status: 403 });
  return createEventStream<ReviewStreamEvent<unknown>>(async (emit) => {
    try {
      const { client, options } = liveConfiguration();
      const report = await runTriage(client, options, (data) => emit({ type: "progress", data }));
      // Schema is retained in CLI reports; the UI needs only the plan and results.
      const { schema: _schema, ...result } = report;
      const chatSignatures = Object.fromEntries(report.ranked.map((item) => [item.id, signReviewItem(report.resource, report.generatedAt, item)]));
      emit({ type: "result", data: { ...result, chatSignatures } });
    } catch (error) {
      emit({ type: "error", data: { error: error instanceof Error ? error.message : "Federato triage failed." } });
    }
  }, request.signal);
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "Use the queue page on this site." }, { status: 403 });
  try {
    const { client, options } = liveConfiguration();
    const report = await runTriage(client, options);
    // Schema is retained in CLI reports; the UI needs only the plan and results.
    const { schema: _schema, ...result } = report;
    try { await saveTriageReport(result); }
    catch (error) { console.warn("Ranked queue was served without being saved", error instanceof Error ? error.name : "UnknownError"); }
    return Response.json(result, { headers: noStore });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Federato triage failed." }, { status: 502, headers: noStore });
  }
}
