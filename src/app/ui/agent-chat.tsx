"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChatCircleDots, Microphone, PaperPlaneTilt, ShieldCheck, Stop, User, WarningCircle } from "@phosphor-icons/react/dist/ssr";

type Turn = { id: number; role: "you" | "agent"; text: string; audio?: string };
type Reply = { question: string; spoken: boolean; reply: string; model: string | null; audio: string | null; error?: string };

const RECORDING_LIMIT_MS = 60_000;

function recorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
}

function recordingName(type: string): string {
  return `speech.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`;
}

/** Talk to the agent about this case, by typing or by voice. The conversation lives on the page; the case record stays as it is. */
export function AgentChat({ id, voiceAvailable }: { id: string; voiceAvailable: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(voiceAvailable);
  const [error, setError] = useState<string | null>(null);
  const [micSupported, setMicSupported] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const nextId = useRef(1);

  useEffect(() => { setMicSupported(Boolean(navigator.mediaDevices?.getUserMedia) && recorderMimeType() !== undefined); }, []);
  useEffect(() => () => { recorder.current?.stream.getTracks().forEach((track) => track.stop()); player.current?.pause(); }, []);

  async function ask(body: FormData | { text: string }, said?: string) {
    setBusy(true); setError(null);
    const history = turns.map(({ role, text }) => ({ role, text }));
    const isForm = body instanceof FormData;
    if (isForm) { body.set("history", JSON.stringify(history)); body.set("voice", speakReplies ? "1" : "0"); }
    if (said) setTurns((current) => [...current, { id: nextId.current++, role: "you", text: said }]);
    try {
      const response = await fetch(`/api/cases/${id}/chat`, {
        method: "POST",
        headers: isForm ? undefined : { "Content-Type": "application/json" },
        body: isForm ? body : JSON.stringify({ ...body, history, voice: speakReplies }),
      });
      const reply = await response.json() as Reply;
      if (!response.ok) throw new Error(reply.error ?? "The agent could not answer.");
      setTurns((current) => [
        ...current,
        // A spoken question shows up as its transcript once the server has heard it.
        ...(said ? [] : [{ id: nextId.current++, role: "you" as const, text: reply.question }]),
        { id: nextId.current++, role: "agent" as const, text: reply.reply, audio: reply.audio ?? undefined },
      ]);
      if (reply.audio) {
        const audio = player.current ?? new Audio();
        player.current = audio;
        audio.src = `data:audio/mpeg;base64,${reply.audio}`;
        // Browsers that refuse autoplay still get the inline player under the reply.
        audio.play().catch(() => undefined);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The agent could not answer.");
    } finally {
      setBusy(false);
    }
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const said = text.trim();
    if (!said || busy) return;
    setText("");
    void ask({ text: said }, said);
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = recorderMimeType();
      const media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      media.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recorder.current = null;
        setRecording(false);
        const blob = new Blob(chunks, { type: media.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        const form = new FormData();
        form.append("audio", blob, recordingName(blob.type));
        void ask(form);
      };
      recorder.current = media;
      media.start();
      setRecording(true);
      setTimeout(() => { if (recorder.current === media && media.state === "recording") media.stop(); }, RECORDING_LIMIT_MS);
    } catch {
      setError("The microphone is blocked. Allow it in the browser and try again, or type the question.");
    }
  }

  function stopRecording() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  const canTalk = voiceAvailable && micSupported;

  return <section className="agent-chat" aria-labelledby="agent-chat-title">
    <div className="section-heading"><h2 id="agent-chat-title">Ask the agent</h2><ChatCircleDots size={16} aria-hidden="true" /></div>
    <p className="subtle">Ask about a fact, a check, or what to do next.{canTalk ? " Press Talk to say it out loud and the agent answers in kind." : ""}</p>
    {turns.length > 0 && <ol className="quote-thread agent-chat-thread" aria-label="Conversation with the agent">
      {turns.map((turn) => <li key={turn.id} className={`conversation-message ${turn.role === "you" ? "request-message" : "agent-message"}`}>
        <div className={`message-avatar ${turn.role === "you" ? "requester-avatar" : "agent-avatar"}`}>{turn.role === "you" ? <User size={16} aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}</div>
        <div className="message-content">
          <p className="message-label">{turn.role === "you" ? "You" : "Underwriting agent"}</p>
          <p className="brief">{turn.text}</p>
          {turn.audio && <audio className="brief-audio" controls preload="none" src={`data:audio/mpeg;base64,${turn.audio}`} aria-label="Listen to this reply" />}
        </div>
      </li>)}
    </ol>}
    <div aria-live="polite">
      {busy && <p className="progress-line" role="status"><ChatCircleDots size={16} aria-hidden="true" />Working on an answer…</p>}
      {recording && <p className="progress-line" role="status"><Microphone size={16} aria-hidden="true" />Listening. Press Stop and send when you are done.</p>}
      {error && <div className="alert" role="alert"><WarningCircle size={17} aria-hidden="true" />{error}</div>}
    </div>
    <form className="quote-composer agent-chat-composer" onSubmit={send}>
      <label>Your question<textarea rows={2} maxLength={4000} value={text} onChange={(event) => setText(event.target.value)} placeholder="For example: which check worries you most, and why?" disabled={busy || recording} /></label>
      <div className="agent-chat-actions">
        {voiceAvailable && <label className="agent-chat-toggle"><input type="checkbox" checked={speakReplies} onChange={(event) => setSpeakReplies(event.target.checked)} />Speak replies</label>}
        {canTalk && <button type="button" className={`secondary-button${recording ? " is-recording" : ""}`} onClick={recording ? stopRecording : () => void startRecording()} disabled={busy} aria-pressed={recording}>{recording ? <Stop size={15} aria-hidden="true" /> : <Microphone size={15} aria-hidden="true" />}{recording ? "Stop and send" : "Talk"}</button>}
        <button className="primary-button" type="submit" disabled={busy || recording || !text.trim()}><PaperPlaneTilt size={15} aria-hidden="true" />Send</button>
      </div>
    </form>
  </section>;
}
