"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import type { SimilarCasesResult } from "@/agent/similar-cases";
import type { CaseStatus } from "@/lib/types";
import { loadSimilarCases } from "./load-similar-cases";
import { Status } from "./status";

/**
 * Precedent: the nearest decided cases to this one and how they ended. Loads once per analysis
 * revision or status change, and renders nothing at all when there is nothing to show (no key,
 * no memory yet, or a lookup that failed), so the page never carries an empty section.
 */
export function SimilarCases({ id, revision, status }: { id: string; revision: number; status: CaseStatus }) {
  const [result, setResult] = useState<SimilarCasesResult | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadSimilarCases(id).then((payload) => { if (!cancelled) setResult(payload); });
    return () => { cancelled = true; };
  }, [id, revision, status]);
  if (!result?.cases.length) return null;
  return <section className="detail-section" aria-labelledby="precedent-title">
    <div className="section-heading"><h2 id="precedent-title">Similar past cases</h2><ClockCounterClockwise size={16} aria-hidden="true" /></div>
    <p className="brief">{result.summary}</p>
    <ol className="precedent-list">{result.cases.map((item) => <li key={item.caseId}>
      <div className="precedent-head">
        <Link className="text-link" href={`/cases/${item.caseId}`}>{item.insuredName}</Link>
        <span className="precedent-meta">{item.state ? `${item.state} · ` : ""}{Math.round(item.score * 100)}% similar</span>
        <Status value={item.status} />
      </div>
      {item.briefSummary && <p>{item.briefSummary}</p>}
      {item.decision && <p className="precedent-decision">Decision: {item.decision}</p>}
      {item.refers.length > 0 && <span className="annotation">referred: {item.refers.map((refer) => refer.label).join(", ")}</span>}
    </li>)}</ol>
    <div className="source-line"><span>Ranked by {result.path === "atlas" ? "Atlas Vector Search" : "cosine similarity"} over Gemini embeddings of each case briefing. Precedent informs the review; it does not decide it.</span></div>
  </section>;
}
