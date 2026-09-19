import { NextResponse } from "next/server";
import { getCase } from "@/lib/db";
import { requireApiSession } from "@/lib/auth-access";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "Use the case page on this site." }, { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid case ID." }, { status: 400 });
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Voice brief is unavailable." }, { status: 503 });
  const caseRecord = await getCase(id);
  if (!caseRecord) return NextResponse.json({ error: "Case not found." }, { status: 404 });
  if (!caseRecord.brief) return NextResponse.json({ error: "Review brief is not ready." }, { status: 409 });

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128&enable_logging=false`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text: `Underwriting review brief. ${caseRecord.brief}`, model_id: "eleven_multilingual_v2" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok || !response.body) throw new Error(`ElevenLabs returned ${response.status}`);
    return new Response(response.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    console.error("Voice brief unavailable", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Voice brief could not be generated." }, { status: 503 });
  }
}
