"use client";

import { useEffect, useRef, useState } from "react";
import { SpeakerHigh, Stop } from "@phosphor-icons/react/dist/ssr";

/** Reads the review brief aloud. One button: it fetches the audio the first time, plays straight away, and turns into Stop while it runs. */
export function VoiceBrief({ id }: { id: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [error, setError] = useState(false);
  const player = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);

  useEffect(() => () => { player.current?.pause(); if (url.current) URL.revokeObjectURL(url.current); }, []);

  async function listen() {
    setError(false);
    if (!url.current) {
      setState("loading");
      try {
        const response = await fetch(`/api/cases/${id}/audio`, { method: "POST" });
        if (!response.ok) throw new Error("Voice brief unavailable");
        url.current = URL.createObjectURL(await response.blob());
      } catch {
        setError(true); setState("idle"); return;
      }
    }
    const element = player.current ?? new Audio();
    player.current = element;
    element.onended = () => setState("idle");
    element.src = url.current;
    setState("playing");
    element.play().catch(() => { setError(true); setState("idle"); });
  }

  function stop() {
    player.current?.pause();
    setState("idle");
  }

  return <div className="voice-brief">
    {state === "playing"
      ? <button className="secondary-button" type="button" onClick={stop}><Stop size={16} />Stop</button>
      : <button className="secondary-button" type="button" onClick={() => void listen()} disabled={state === "loading"}><SpeakerHigh size={16} />{state === "loading" ? "Preparing audio..." : "Listen to brief"}</button>}
    {error && <span className="auth-error" role="alert">Voice brief could not be loaded.</span>}
  </div>;
}
