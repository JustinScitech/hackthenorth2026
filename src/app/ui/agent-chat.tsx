"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChatCircleDots, PaperPlaneTilt, ShieldCheck, SpeakerHigh, Stop, User, WarningCircle, Waveform } from "@phosphor-icons/react/dist/ssr";
import { VoiceMode } from "./voice-mode";

type Turn = { id: number; role: "you" | "agent"; text: string; audio?: string };
type Reply = { question: string; spoken: boolean; reply: string; model: string | null; audio: string | null; error?: string };

/** Talk to the agent about this case, by typing or in a voice conversation. The thread lives on the page; the case record stays as it is. */
export function AgentChat({ id, voiceAvailable }: { id: string; voiceAvailable: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(voiceAvailable);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micSupported, setMicSupported] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const nextId = useRef(1);

  useEffect(() => { setMicSupported(Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined" && typeof AudioContext !== "undefined"); }, []);
  useEffect(() => () => { player.current?.pause(); }, []);

  /** One shared player for typed replies, so a new reply cuts off the previous one. */
  function play(turnId: number, audio: string) {
    const element = player.current ?? new Audio();
    player.current = element;
    element.onended = () => setPlayingId(null);
    element.src = `data:audio/mpeg;base64,${audio}`;
    setPlayingId(turnId);
    // A browser that blocks autoplay leaves the speaker button in place, so a click plays it.
    element.play().catch(() => setPlayingId(null));
  }

  function stop() {
    player.current?.pause();
    setPlayingId(null);
  }

  /** Sends a question: typed text as JSON, a recording as multipart. Returns the reply so voice mode can play it through its own speaker. */
  async function ask(body: FormData | { text: string }, said?: string, options: { speak?: boolean } = {}): Promise<Reply | null> {
    setBusy(true); setError(null);
    const history = turns.map(({ role, text }) => ({ role, text }));
    const isForm = body instanceof FormData;
    if (isForm) { body.set("history", JSON.stringify(history)); if (!body.has("voice")) body.set("voice", speakReplies ? "1" : "0"); }
    if (said) { const youId = nextId.current++; setTurns((current) => [...current, { id: youId, role: "you", text: said }]); }
    try {
      const response = await fetch(`/api/cases/${id}/chat`, {
        method: "POST",
        headers: isForm ? undefined : { "Content-Type": "application/json" },
        body: isForm ? body : JSON.stringify({ ...body, history, voice: speakReplies }),
      });
      const reply = await response.json() as Reply;
      if (!response.ok) throw new Error(reply.error ?? "The agent could not answer.");
      // Ids are taken here rather than inside the updater, which React may run more than once.
      const heardId = said ? null : nextId.current++;
      const agentId = nextId.current++;
      setTurns((current) => [
        ...current,
        // A spoken question shows up as its transcript once the server has heard it.
        ...(heardId === null ? [] : [{ id: heardId, role: "you" as const, text: reply.question }]),
        { id: agentId, role: "agent" as const, text: reply.reply, audio: reply.audio ?? undefined },
      ]);
      if (reply.audio && options.speak !== false) play(agentId, reply.audio);
      return reply;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The agent could not answer.");
      return null;
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

  const canTalk = voiceAvailable && micSupported;

  return <section className="agent-chat" aria-labelledby="agent-chat-title">
    <div className="section-heading"><h2 id="agent-chat-title">Ask the agent</h2><ChatCircleDots size={16} aria-hidden="true" /></div>
    <p className="subtle">Ask about a fact, a check, or what to do next.{canTalk ? " Or open Voice and talk it through." : ""}</p>
    {turns.length > 0 && <ol className="quote-thread agent-chat-thread" aria-label="Conversation with the agent">
      {turns.map((turn) => <li key={turn.id} className={`conversation-message ${turn.role === "you" ? "request-message" : "agent-message"}`}>
        <div className={`message-avatar ${turn.role === "you" ? "requester-avatar" : "agent-avatar"}`}>{turn.role === "you" ? <User size={16} aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}</div>
        <div className="message-content">
          <div className="message-label-row">
            <p className="message-label">{turn.role === "you" ? "You" : "Underwriting agent"}</p>
            {turn.audio && (playingId === turn.id
              ? <button type="button" className="icon-button speak-button is-playing" onClick={stop} aria-label="Stop"><Stop size={13} aria-hidden="true" /></button>
              : <button type="button" className="icon-button speak-button" onClick={() => play(turn.id, turn.audio!)} aria-label="Play reply"><SpeakerHigh size={13} aria-hidden="true" /></button>)}
          </div>
          <p className="brief">{turn.text}</p>
        </div>
      </li>)}
    </ol>}
    <div aria-live="polite">
      {busy && !voiceOpen && <p className="progress-line" role="status"><ChatCircleDots size={16} aria-hidden="true" />Working on an answer…</p>}
      {error && !voiceOpen && <div className="alert" role="alert"><WarningCircle size={17} aria-hidden="true" />{error}</div>}
    </div>
    <form className="quote-composer agent-chat-composer" onSubmit={send}>
      <label>Your question<textarea rows={2} maxLength={4000} value={text} onChange={(event) => setText(event.target.value)} placeholder="For example: which check worries you most, and why?" disabled={busy} /></label>
      <div className="agent-chat-actions">
        {voiceAvailable && <label className="agent-chat-toggle"><input type="checkbox" checked={speakReplies} onChange={(event) => setSpeakReplies(event.target.checked)} />Speak replies</label>}
        {canTalk && <button type="button" className="secondary-button" onClick={() => setVoiceOpen(true)} disabled={busy}><Waveform size={15} aria-hidden="true" />Voice</button>}
        <button className="primary-button" type="submit" disabled={busy || !text.trim()}><PaperPlaneTilt size={15} aria-hidden="true" />Send</button>
      </div>
    </form>
    {voiceOpen && <VoiceMode turns={turns} error={error} onAsk={(form) => ask(form, undefined, { speak: false })} onClose={() => setVoiceOpen(false)} />}
  </section>;
}
