import { NextResponse } from "next/server";
import { findSimilarCases } from "@/agent/similar-cases";
import { requireApiSession } from "@/lib/auth-access";

/** The k nearest decided cases to this one. Never fails the page: without a key or a store the answer is simply empty, with `path` saying why. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid case ID." }, { status: 400 });
  const result = await findSimilarCases(id);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
