import { NextResponse } from "next/server";
import { listQuotes } from "@/lib/quotes";
import { requireApiSession } from "@/lib/auth-access";

export const runtime = "nodejs";

/** Workspace view of recent quote requests; the public quoting endpoint itself needs no session. */
export async function GET(request: Request) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ quotes: await listQuotes() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Quotes unavailable", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Quotes are unavailable." }, { status: 503 });
  }
}
