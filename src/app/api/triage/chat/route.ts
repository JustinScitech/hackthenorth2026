import { z } from "zod";
import { triageBriefing, type ChatTurn } from "@/agent/chat";
import { streamChatResponse } from "@/agent/chat-stream";
import type { RankedSubmission } from "@/federato/scoring";
import { requireApiSession } from "@/lib/auth-access";
import { verifyReviewItem } from "@/federato/review-signature";

export const runtime = "nodejs";
export const maxDuration = 60;

const criterion = z.object({
  concept: z.string(), factor: z.string(), status: z.enum(["target", "acceptable", "outside", "unknown"]),
  points: z.number(), maximum: z.number(), detail: z.string(), source: z.string(),
});
const itemSchema = z.object({
  id: z.string().max(160), account: z.string().max(160), score: z.number(), rawScore: z.number(),
  recommendation: z.string().max(500), explanation: z.string().max(4000),
  criteria: z.array(criterion).max(8), missingData: z.array(z.string()).max(20),
  evidenceNote: z.string().max(2000).optional(), lifecycleStatus: z.string().max(160).optional(),
});
const schema = z.object({
  resource: z.string().max(60), generatedAt: z.string().datetime(), item: itemSchema, signature: z.string().length(64),
  text: z.string().trim().min(1).max(4000),
  history: z.array(z.object({ role: z.enum(["you", "agent"]), text: z.string().min(1).max(4000) })).max(40).default([]),
});

export async function POST(request: Request) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "Use the triage page on this site." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose a ranked record and ask a question." }, { status: 400 });
  const { resource, generatedAt, item, signature, text, history } = parsed.data;
  if (!verifyReviewItem(resource, generatedAt, (body as { item: RankedSubmission }).item, signature)) return Response.json({ error: "This review is stale. Run triage again before asking the agent." }, { status: 409 });
  return streamChatResponse(triageBriefing(resource, item as RankedSubmission), history as ChatTurn[], text);
}
