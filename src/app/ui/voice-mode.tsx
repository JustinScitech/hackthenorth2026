"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Microphone, MicrophoneSlash, ShieldCheck, User, X } from "@phosphor-icons/react/dist/ssr";

export type VoiceTurn = { id: number; role: "you" | "agent"; text: string };
export type VoiceReply = { question: string; reply: string; audio: string | null };

type Phase = "listening" | "thinking" | "speaking";

const BAR_COUNT = 36;
const FRAME_MS = 50;
const SILENCE_MS = 1100;         // this much quiet after speech ends the utterance
const MIN_SPEECH_MS = 350;       // shorter bursts are coughs and clicks
const MAX_UTTERANCE_MS = 30_000;
const IDLE_RESTART_MS = 3000;    // while nobody is talking, start a fresh recording so the sent clip carries little dead air

function recorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
}

function recordingName(type: string): string {
  return `speech.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`;
}

const STATUS: Record<Phase, string> = { listening: "Listening", thinking: "Thinking", speaking: "Speaking" };

/**
 * Hands-free conversation with the agent. Open it and talk: the mic is live, a pause ends your
 * turn, the reply plays straight back, and the mic reopens when it finishes. One analyser feeds the
 * waveform from whichever side is making sound. The transcript runs alongside and is the same
 * list the text chat shows, so closing this keeps everything said.
 */
export function VoiceMode({ turns, error, onAsk, onClose }: {
  turns: VoiceTurn[];
  error: string | null;
  onAsk: (form: FormData) => Promise<VoiceReply | null>;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("listening");
  const [muted, setMuted] = useState(false);
  const [caption, setCaption] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const audio = useRef<{ context: AudioContext; analyser: AnalyserNode; stream: MediaStream; player: HTMLAudioElement } | null>(null);
  const recorder = useRef<{ media: MediaRecorder; chunks: Blob[]; startedAt: number; send: boolean } | null>(null);
  const phaseRef = useRef<Phase>("listening");
  const mutedRef = useRef(false);
  const speech = useRef<{ startedAt: number; lastVoiceAt: number } | null>(null);
  const noiseFloor = useRef(0.01);
  const onAskRef = useRef(onAsk);
  onAskRef.current = onAsk;

  const go = useCallback((next: Phase) => { phaseRef.current = next; setPhase(next); }, []);

  const armRecorder = useCallback(() => {
    const graph = audio.current;
    if (!graph) return;
    const mimeType = recorderMimeType();
    const media = new MediaRecorder(graph.stream, mimeType ? { mimeType } : undefined);
    const entry = { media, chunks: [] as Blob[], startedAt: performance.now(), send: false };
    media.ondataavailable = (event) => { if (event.data.size > 0) entry.chunks.push(event.data); };
    media.onstop = () => {
      if (recorder.current === entry) recorder.current = null;
      if (!entry.send) return;
      const blob = new Blob(entry.chunks, { type: media.mimeType || "audio/webm" });
      if (blob.size === 0) { armRecorder(); return; }
      const form = new FormData();
      form.append("audio", blob, recordingName(blob.type));
      form.append("voice", "1");
      go("thinking");
      setCaption("");
      void onAskRef.current(form).then((reply) => {
        if (reply?.audio) {
          setCaption(reply.reply);
          go("speaking");
          const player = audio.current?.player;
          if (!player) return;
          player.src = `data:audio/mpeg;base64,${reply.audio}`;
          player.onended = () => { if (phaseRef.current === "speaking") { go("listening"); armRecorder(); } };
          player.play().catch(() => { go("listening"); armRecorder(); });
        } else {
          if (reply) setCaption(reply.reply);
          go("listening");
          armRecorder();
        }
      });
    };
    media.start();
    recorder.current = entry;
    speech.current = null;
  }, [go]);

  /** Cut the agent off and take the floor back. */
  const interrupt = useCallback(() => {
    if (phaseRef.current !== "speaking") return;
    audio.current?.player.pause();
    go("listening");
    armRecorder();
  }, [armRecorder, go]);

  // Open the mic and the audio graph once, then run the level meter, the turn-taking loop, and the waveform.
  useEffect(() => {
    let cancelled = false;
    let meter: ReturnType<typeof setInterval> | undefined;
    let frame = 0;
    const timeDomain = new Uint8Array(256);
    const spectrum = new Uint8Array(128);

    async function open() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        const context = new AudioContext();
        await context.resume();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.82;
        context.createMediaStreamSource(stream).connect(analyser);
        const player = new Audio();
        player.crossOrigin = "anonymous";
        const playback = context.createMediaElementSource(player);
        playback.connect(analyser);
        playback.connect(context.destination);
        audio.current = { context, analyser, stream, player };
        armRecorder();
      } catch {
        setMicError("The microphone is blocked. Allow it in the browser and open voice again.");
        return;
      }

      meter = setInterval(() => {
        const graph = audio.current;
        const entry = recorder.current;
        if (!graph) return;
        // The mic track is disabled while the agent speaks or you are muted, so only your voice reaches this.
        graph.stream.getAudioTracks().forEach((track) => { track.enabled = phaseRef.current === "listening" && !mutedRef.current; });
        if (phaseRef.current !== "listening" || mutedRef.current || !entry) return;
        graph.analyser.getByteTimeDomainData(timeDomain);
        let sum = 0;
        for (const sample of timeDomain) { const v = (sample - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / timeDomain.length);
        const now = performance.now();
        const threshold = Math.max(0.012, noiseFloor.current * 3);
        if (speech.current) {
          if (rms > threshold) speech.current.lastVoiceAt = now;
          const quietFor = now - speech.current.lastVoiceAt;
          const spokenFor = now - speech.current.startedAt;
          if (quietFor > SILENCE_MS || spokenFor > MAX_UTTERANCE_MS) {
            entry.send = spokenFor - quietFor >= MIN_SPEECH_MS;
            entry.media.stop();
            if (!entry.send) armRecorder();
          }
        } else if (rms > threshold) {
          speech.current = { startedAt: now, lastVoiceAt: now };
        } else {
          noiseFloor.current = noiseFloor.current * 0.95 + rms * 0.05;
          if (now - entry.startedAt > IDLE_RESTART_MS) { entry.media.stop(); armRecorder(); }
        }
      }, FRAME_MS);

    }
    // The wave is on screen from the first frame: it breathes on its own until the mic opens, then follows the sound.
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const surface = canvas.current;
      if (!surface) return;
      const graph = audio.current;
      const scale = window.devicePixelRatio || 1;
      const width = surface.clientWidth, height = surface.clientHeight;
      if (surface.width !== width * scale || surface.height !== height * scale) { surface.width = width * scale; surface.height = height * scale; }
      const ctx = surface.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const styles = getComputedStyle(surface);
      const idle = !graph || phaseRef.current === "thinking";
      const colour = idle ? styles.getPropertyValue("--muted") : phaseRef.current === "speaking" ? styles.getPropertyValue("--accent") : styles.getPropertyValue("--text");
      if (graph) graph.analyser.getByteFrequencyData(spectrum);
      const gap = 4, bar = (width - gap * (BAR_COUNT - 1)) / BAR_COUNT;
      const t = performance.now() / 1000;
      ctx.fillStyle = colour.trim() || "#888";
      for (let i = 0; i < BAR_COUNT; i++) {
        // Bars sample the voice band, spread outward from the middle so the shape reads as one breathing form.
        const distance = Math.abs(i - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
        const bin = 2 + Math.floor(distance * 44);
        const level = idle ? 0.16 + 0.1 * Math.sin(t * 2.4 + i * 0.45) * (1 - distance * 0.5) : (spectrum[bin] / 255) * (1 - distance * 0.45);
        const h = Math.max(4, level * height);
        const x = i * (bar + gap), y = (height - h) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, bar, h, bar / 2);
        ctx.fill();
      }
    };
    frame = requestAnimationFrame(draw);
    void open();

    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (meter) clearInterval(meter);
      cancelAnimationFrame(frame);
      const entry = recorder.current;
      if (entry) { entry.send = false; if (entry.media.state !== "inactive") entry.media.stop(); }
      const graph = audio.current;
      if (graph) {
        graph.player.pause();
        graph.stream.getTracks().forEach((track) => track.stop());
        void graph.context.close();
        audio.current = null;
      }
    };
  }, [armRecorder, onClose]);

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { transcriptEnd.current?.scrollIntoView({ block: "end" }); }, [turns.length]);

  const status = micError ? "Microphone unavailable" : muted && phase === "listening" ? "Muted" : STATUS[phase];

  return createPortal(
    <div className="voice-overlay" role="dialog" aria-modal="true" aria-label="Voice conversation with the agent">
      <div className="voice-stage">
        <canvas ref={canvas} className="voice-wave" onClick={interrupt} aria-hidden="true" />
        <p className="voice-status" role="status" aria-live="polite">{status}{phase === "speaking" ? " · tap the wave to interrupt" : ""}</p>
        <p className="voice-caption">{micError ?? error ?? caption}</p>
        <div className="voice-controls">
          <button type="button" className={`icon-button${muted ? " is-off" : ""}`} onClick={() => setMuted((value) => !value)} aria-pressed={muted} aria-label={muted ? "Unmute microphone" : "Mute microphone"}>{muted ? <MicrophoneSlash size={20} /> : <Microphone size={20} />}</button>
          <button type="button" className="icon-button voice-end" onClick={onClose} aria-label="End voice conversation"><X size={20} /></button>
        </div>
      </div>
      <aside className="voice-transcript" aria-label="Transcript">
        {turns.length === 0
          ? <p className="empty-state">Say something about the case. What you both say shows up here.</p>
          : <ol className="quote-thread">
            {turns.map((turn) => <li key={turn.id} className={`conversation-message ${turn.role === "you" ? "request-message" : "agent-message"}`}>
              <div className={`message-avatar ${turn.role === "you" ? "requester-avatar" : "agent-avatar"}`}>{turn.role === "you" ? <User size={16} aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}</div>
              <div className="message-content"><p className="message-label">{turn.role === "you" ? "You" : "Underwriting agent"}</p><p className="brief">{turn.text}</p></div>
            </li>)}
          </ol>}
        <div ref={transcriptEnd} />
      </aside>
    </div>,
    document.body,
  );
}
