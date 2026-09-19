"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Catches errors thrown by the root layout, where the normal error boundary cannot run.
// It must render its own <html> and <body> because the root layout has failed.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", background: "#f6f5f1", color: "#262633" }}>
        <main style={{ maxWidth: 440, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#777680", fontSize: 14, marginBottom: 20 }}>The error has been reported. No submission text is included in the report.{error.digest ? ` Reference ${error.digest}.` : ""}</p>
          <button type="button" onClick={reset} style={{ padding: "8px 16px", borderRadius: 9999, border: 0, background: "#6559cd", color: "#fff", fontSize: 14, cursor: "pointer" }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
