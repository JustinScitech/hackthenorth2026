import type { Fact } from "./types";

export function normalizeState(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const state = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : null;
}

export function normalizeFact<T>(fact: Fact<T>): Fact<T> {
  const missing = fact.value == null || (typeof fact.value === "string" && /^(?:null|undefined)?$/i.test(fact.value.trim()));
  return missing ? { value: null, source: "Not provided", confidence: 0 } : fact;
}
