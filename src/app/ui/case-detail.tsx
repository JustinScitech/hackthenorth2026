"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { AuditEvent, CaseRecord, JobStatus } from "@/lib/types";
import { CaseView } from "./case-view";
import { readReviewStream } from "@/lib/review-stream";

type Payload = { case: CaseRecord; audit: AuditEvent[]; jobStatus: JobStatus; voiceAvailable: boolean };

function normalizePayload(payload: Payload): Payload {
  return { ...payload, case: {
    ...payload.case,
    address: payload.case.address ?? null,
    propertyContext: payload.case.propertyContext ?? null,
    publicEvidence: payload.case.publicEvidence ?? null,
    sourceCandidates: payload.case.sourceCandidates ?? null,
    extractionConflicts: payload.case.extractionConflicts ?? [],
    reportDraft: payload.case.reportDraft ?? null,
    reportDraftVersion: payload.case.reportDraftVersion ?? 0,
    analysisRevision: payload.case.analysisRevision ?? 0,
  } };
}

export function CaseDetail({ id }: { id: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const actionRef = useRef<{ signature: string; id: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await fetch(`/api/cases/${id}`, { cache: "no-store" });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.error ?? "Could not load case.");
      setData(normalizePayload(payload));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load case.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const abort = new AbortController();
    let retry: ReturnType<typeof setTimeout>;
    async function connect() {
      try {
        const response = await fetch(`/api/cases/${id}`, { headers: { Accept: "text/event-stream" }, cache: "no-store", signal: abort.signal });
        if (abort.signal.aborted) return;
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? "Could not load case.");
        }
        if (response.headers.get("content-type")?.includes("text/event-stream")) {
          await readReviewStream<Payload>(response, (event) => {
            if (abort.signal.aborted || event.type !== "result") return;
            setData(normalizePayload(event.data));
            setError(null);
            setLoading(false);
          });
        } else {
          // Existing clients and test fixtures can still answer with one JSON snapshot.
          const snapshot = await response.json() as Payload;
          if (abort.signal.aborted) return;
          setData(normalizePayload(snapshot));
        }
        if (abort.signal.aborted) return;
        setError(null);
        setLoading(false);
      } catch (cause) {
        if (!abort.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Live case activity disconnected. Reconnecting…");
          setLoading(false);
        }
      } finally {
        if (!abort.signal.aborted) retry = setTimeout(() => void connect(), 1500);
      }
    }
    void connect();
    return () => { abort.abort(); clearTimeout(retry); };
  }, [id]);

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
  if (!data) return <main className="shell shell-narrow"><Link className="back-link" href="/cases"><ArrowLeft size={15} /> Cases</Link><div className="alert" role="alert"><WarningCircle size={17} aria-hidden="true" />{error ?? "Case not found."}</div></main>;

  return <CaseView
    key={id} id={id} caseRecord={data.case} audit={data.audit} jobStatus={data.jobStatus} error={error} voiceAvailable={data.voiceAvailable}
    response={response} setResponse={setResponse} reason={reason} setReason={setReason}
    submitting={submitting} onResponse={() => void sendAction("broker_response")}
    onDecision={(kind) => void sendAction(kind)} onReportSaved={() => void refresh()} onSourceConfirmed={() => void refresh()}
  />;
}
