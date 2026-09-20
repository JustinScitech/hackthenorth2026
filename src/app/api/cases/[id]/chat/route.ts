import { NextResponse } from "next/server";
import { z } from "zod";
import { answerCaseQuestion, caseBriefing, type ChatTurn } from "@/agent/chat";
import { streamChatResponse } from "@/agent/chat-stream";
import { findSimilarCases, precedentLines } from "@/agent/similar-cases";
import { speak, transcribe, voiceConfigured } from "@/agent/voice";
import { requireApiSession } from "@/lib/auth-access";
import { getAudit, getCase } from "@/lib/db";

// Transcription, a model reply, and speech back can add up; give the route room on Vercel.
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const historySchema = z.array(z.object({ role: z.enum(["you", "agent"]), text: z.string().min(1).max(4000) })).max(40);

function parseHistory(raw: unknown): ChatTurn[] {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    const parsed = historySchema.safeParse(value ?? []);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

const reject = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return reject("Use the case page on this site.", 403);
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return reject("Invalid case ID.", 400);

  let question = "";
  let history: ChatTurn[] = [];
  let wantVoice = false;
  let spoken = false;
  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await request.formData();
    history = parseHistory(form.get("history"));
    wantVoice = form.get("voice") === "1";
    const audio = form.get("audio");
    if (audio instanceof Blob && audio.size > 0) {
      if (audio.size > MAX_AUDIO_BYTES) return reject("That recording is too long. Keep it under a minute.", 413);
      if (!voiceConfigured()) return reject("Voice is switched off on this server. Type the question instead.", 503);
      try {
        question = await transcribe(audio, audio instanceof File ? audio.name : "speech.webm");
      } catch (error) {
        console.error("Transcription unavailable", error instanceof Error ? error.name : "UnknownError");
        return reject("Transcription failed. Try again, or type the question.", 503);
      }
      spoken = true;
      if (!question) return reject("The recording came through silent. Try again a little closer to the microphone.", 422);
    } else {
      question = String(form.get("text") ?? "").trim();
    }
  } else {
    const body = await request.json().catch(() => null) as { text?: unknown; history?: unknown; voice?: unknown } | null;
    question = typeof body?.text === "string" ? body.text.trim() : "";
    history = parseHistory(body?.history);
    wantVoice = body?.voice === true;
  }
  if (!question) return reject("Ask something first.", 400);
  if (question.length > 4000) return reject("Keep the question under 4,000 characters.", 400);

  let caseRecord;
  let audit;
  try {
    caseRecord = await getCase(id);
    if (!caseRecord) return reject("Case not found.", 404);
    audit = await getAudit(id);
  } catch (error) {
    console.error("Case unavailable for chat", error instanceof Error ? error.name : "UnknownError");
    return reject("Could not load this case. Check local services.", 503);
  }

  // Both response modes use the same case briefing and similar-case context.
  const precedent = precedentLines((await findSimilarCases(id)).cases);
  if (!spoken && !wantVoice && request.headers.get("accept")?.includes("text/event-stream")) {
    return streamChatResponse(caseBriefing(caseRecord, audit, precedent), history, question);
  }

  let answer;
  try {
    answer = await answerCaseQuestion(caseRecord, audit, history, question, precedent);
  } catch (error) {
    console.error("Agent chat unavailable", error instanceof Error ? error.name : "UnknownError");
    return reject("The agent is unavailable right now. Try again in a moment.", 503);
  }

  let audio: string | null = null;
  if (wantVoice && voiceConfigured()) {
    try {
      audio = Buffer.from(await speak(answer.reply)).toString("base64");
    } catch (error) {
      // The text reply still goes back; the page shows it without sound.
      console.error("Spoken reply unavailable", error instanceof Error ? error.name : "UnknownError");
    }
  }
  return NextResponse.json({ question, spoken, reply: answer.reply, model: answer.model, audio }, { headers: { "Cache-Control": "no-store" } });
}
