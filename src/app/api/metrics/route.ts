import { requireApiSession } from "@/lib/auth-access";
import { getAgentMetrics } from "@/lib/agent-metrics";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  try {
    return Response.json(await getAgentMetrics(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Agent metrics unavailable", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Agent metrics are unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
