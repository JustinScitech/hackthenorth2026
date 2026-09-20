"use client";

import { useState } from "react";
import { DownloadSimple, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { ReportConversationTurn } from "@/lib/case-report";

export function CasePdfExport({ id, conversation }: { id: string; conversation: ReportConversationTurn[] }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setExporting(true);
    setError(null);
    try {
      const response = await fetch(`/api/cases/${id}/pdf`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation }),
      });
      if (!response.ok) throw new Error("Could not create the PDF report.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `case-${id.slice(0, 8)}-underwriting-report.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the PDF report.");
    } finally {
      setExporting(false);
    }
  }

  return <>
    <button className="quiet-button" type="button" onClick={() => void download()} disabled={exporting}><DownloadSimple size={16} aria-hidden="true" />{exporting ? "Exporting..." : "Export PDF"}</button>
    {error && <span className="alert" role="alert"><WarningCircle size={17} aria-hidden="true" />{error}</span>}
  </>;
}
