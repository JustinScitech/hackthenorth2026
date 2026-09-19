"use client";

import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";

export function VoiceBrief({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function load() {
    setLoading(true); setError(false);
    try {
      const response = await fetch(`/api/cases/${id}/audio`, { method: "POST" });
      if (!response.ok) throw new Error("Voice brief unavailable");
      setUrl(URL.createObjectURL(await response.blob()));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return <div className="voice-brief">
    {url ? <audio className="brief-audio" controls preload="none" src={url} aria-label="Listen to review brief" />
      : <button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}><Volume2 size={16} />{loading ? "Preparing audio..." : "Listen to brief"}</button>}
    {error && <span className="auth-error" role="alert">Voice brief could not be loaded.</span>}
  </div>;
}
