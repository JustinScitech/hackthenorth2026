"use client";

import { useState } from "react";
import Link from "next/link";
import type { ParsedInsurancePdf } from "@/lib/insurance-pdf";
import { AppetiteCriteriaTable } from "./appetite-criteria-table";

export function PdfTriage() {
  const [uploaded, setUploaded] = useState<ParsedInsurancePdf | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setUploading(true); setError(""); setUploaded(null);
    try {
      const body = new FormData(); body.set("file", file);
      const response = await fetch("/api/documents/parse", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not analyze the PDF.");
      setUploaded(data as ParsedInsurancePdf);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not analyze the PDF."); }
    finally { setUploading(false); }
  }

  return <section className="card pdf-triage" aria-labelledby="pdf-triage-title">
    <h2 id="pdf-triage-title">Analyze one insurance PDF</h2>
    <p className="subtle">Upload a text-based PDF to check its clearly labeled values against the same appetite factors. This does not change the live Federato queue.</p>
    <label>Insurance PDF <span className="optional">4 MB maximum</span><input type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label>
    {uploading && <p role="status">Reading and scoring PDF...</p>}
    {error && <p role="alert" className="alert">{error}</p>}
    {uploaded && <div className="pdf-triage-result">
      <h3>{uploaded.fields.insuredName || uploaded.filename}</h3>
      <p>{uploaded.score.recommendation} · Match {uploaded.score.rawScore}/100 · Priority {uploaded.score.score}/100</p>
      <p className="subtle">{uploaded.score.evidenceNote}</p>
      <p className="subtle">{uploaded.score.explanation}</p>
      <details><summary>Appetite factors and PDF evidence</summary><AppetiteCriteriaTable criteria={uploaded.score.criteria} /></details>
      <p className="subtle">Want a durable case review? <Link href="/cases/new">Create a case</Link> and upload this PDF there.</p>
    </div>}
  </section>;
}
