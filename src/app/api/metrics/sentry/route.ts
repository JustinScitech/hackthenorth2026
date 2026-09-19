import { requireApiSession } from "@/lib/auth-access";
import { getSentryMetrics } from "@/lib/sentry-metrics";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  try {
    return Response.json(await getSentryMetrics(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Sentry metrics unavailable", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Sentry metrics are unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
