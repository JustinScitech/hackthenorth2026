"use client";

import { useCallback, useEffect, useState } from "react";
import type { CaseRecord } from "@/lib/types";
import { loadCases } from "./load-cases";

/** Polls the case list. Shared by the overview and the cases page. */
export function useCases(intervalMs = 5000) {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setCases(await loadCases());
      setHasLoaded(true);
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

  return { cases, loading, hasLoaded, error, refresh };
}
