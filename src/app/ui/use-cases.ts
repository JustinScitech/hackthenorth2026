"use client";

import { useCallback, useEffect, useState } from "react";
import type { CaseRecord } from "@/lib/types";

/** Polls the case list. Shared by the overview and the cases page. */
export function useCases(intervalMs = 5000) {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/cases", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load cases.");
      setCases(data.cases);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load cases.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  return { cases, loading, error, refresh };
}
