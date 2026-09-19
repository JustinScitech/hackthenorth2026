"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleAlert } from "lucide-react";
import type { AuditEvent, CaseRecord, JobStatus } from "@/lib/types";
import { CaseView } from "./case-view";

type Payload = { case: CaseRecord; audit: AuditEvent[]; jobStatus: JobStatus; voiceAvailable: boolean };

export function CaseDetail({ id }: { id: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const actionRef = useRef<{ signature: string; id: string } | null>(null);
  const pollInterval = !data || ["received", "extracting", "checking"].includes(data.case.status) ? 1000 : 3000;

  const refresh = useCallback(async () => {
    try {
      const result = await fetch(`/api/cases/${id}`, { cache: "no-store" });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.error ?? "Could not load case.");
      setData(payload);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load case.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await refresh();
      if (!cancelled) timer = setTimeout(() => void poll(), pollInterval);
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [refresh, pollInterval]);

  async function sendAction(kind: "broker_response" | "approve" | "decline") {
    const body = kind === "broker_response" ? { kind, response } : { kind, reason };
    const signature = JSON.stringify(body);
    if (actionRef.current?.signature !== signature) actionRef.current = { signature, id: crypto.randomUUID() };
    setSubmitting(true);
    setError(null);
    try {
      const result = await fetch(`/api/cases/${id}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, id: actionRef.current.id }),
      });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.error ?? "Could not send action.");
      actionRef.current = null;
      setResponse("");
      setReason("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send action.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !data) return <main className="shell shell-narrow"><Link className="back-link" href="/cases"><ArrowLeft size={15} /> Cases</Link><div className="card"><p className="empty-state">Loading case...</p></div></main>;
  if (!data) return <main className="shell shell-narrow"><Link className="back-link" href="/cases"><ArrowLeft size={15} /> Cases</Link><div className="alert" role="alert"><CircleAlert size={17} aria-hidden="true" />{error ?? "Case not found."}</div></main>;

  return <CaseView
    id={id} caseRecord={data.case} audit={data.audit} jobStatus={data.jobStatus} error={error} voiceAvailable={data.voiceAvailable}
    response={response} setResponse={setResponse} reason={reason} setReason={setReason}
    submitting={submitting} onResponse={() => void sendAction("broker_response")}
    onDecision={(kind) => void sendAction(kind)}
  />;
}
