import "server-only";
import { liveConfiguration } from "@/federato/config";
import { runTriage } from "@/federato/triage";
import { requireApiSession } from "@/lib/auth-access";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "Use the triage page on this site." }, { status: 403 });
  try {
    const { client, options } = liveConfiguration();
    const report = await runTriage(client, options);
    // Schema is retained in CLI reports; the UI needs only the plan and results.
    const { schema: _schema, ...result } = report;
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Federato triage failed." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
