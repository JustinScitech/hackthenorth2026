/**
 * ElevenLabs speech in both directions: Scribe turns what the underwriter said
 * into text, and text-to-speech reads the agent's reply back. Both are plain
 * HTTPS calls so the key stays on the server.
 */
const ELEVENLABS = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";

export function voiceConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

function apiKey(): string {
  return process.env.ELEVENLABS_API_KEY ?? "";
}

function failure(step: string, status: number) {
  return Object.assign(new Error(`ElevenLabs ${step} returned ${status}`), { status });
}

/** Transcribes a short browser recording (webm, ogg, or mp4 audio). Returns an empty string for silence. */
export async function transcribe(audio: Blob, filename = "speech.webm"): Promise<string> {
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("file", audio, filename);
  const response = await fetch(`${ELEVENLABS}/speech-to-text`, { method: "POST", headers: { "xi-api-key": apiKey() }, body: form, signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw failure("speech-to-text", response.status);
  const body = await response.json() as { text?: string };
  return (body.text ?? "").trim();
}

/** Reads text aloud as MP3 bytes. Flash keeps a conversational reply under a couple of seconds. */
export async function speak(text: string, modelId = "eleven_flash_v2_5"): Promise<ArrayBuffer> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE;
  const response = await fetch(`${ELEVENLABS}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64&enable_logging=false`, {
    method: "POST",
    headers: { "xi-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: modelId }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw failure("text-to-speech", response.status);
  return response.arrayBuffer();
}
