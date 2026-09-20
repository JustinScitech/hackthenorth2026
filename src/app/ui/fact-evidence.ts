import type { CaseAppetite } from "@/lib/case-appetite";
import type { FactCandidate } from "@/lib/types";

/** Presentation of the per-field facts on the case page: values in the underwriter's vocabulary, readers that disagreed. */
export type FactField = "yearBuilt" | "losses" | keyof CaseAppetite;

export const APPETITE_FACT_ROWS: [keyof CaseAppetite, string][] = [
  ["business", "Business type"], ["line", "Line of business"], ["premium", "Premium"], ["constructionPercent", "Eligible construction percent"],
  ["lossValue", "Five-year loss value"], ["lossHistoryComplete", "Five-year history complete"], ["effective", "Effective date"], ["expiration", "Expiration date"],
];

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function formatFactValue(field: FactField, value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return field === "premium" || field === "lossValue" ? `$${value.toLocaleString("en-US")}` : field === "constructionPercent" ? `${value}%` : String(value);
  return field === "business" || field === "line" ? capitalize(value) : value;
}

export function describeCandidate(field: FactField, candidate: FactCandidate<string | number | boolean>): string {
  return `${candidate.source} read ${formatFactValue(field, candidate.value)}`;
}
