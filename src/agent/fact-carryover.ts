import { APPETITE_FIELDS, FIELD_LABELS, type AppetiteField } from "./extraction-schema";
import type { Fact, Facts } from "../lib/types";

/**
 * Every revision re-reads the whole broker text from scratch, so a revision in
 * which no model answered (the free-tier quota is per model and per minute)
 * would fall back to the line parser and un-learn every fact only a model had
 * read: a stated premium, a business type, policy dates. The case would then
 * ask the broker for things they had already said. When that happens, a fact
 * the previous revision knew and this one cannot see is carried forward as it
 * was; a value the parser did read from the new text (an explicit line) still
 * wins, because it is later and explicit. Nothing is carried when a model did
 * answer: then the fresh reading is the truth, including any field it now
 * leaves unknown.
 */
export type CarryOver = { facts: Facts; carried: string[] };

const known = <T>(fact: Fact<T> | undefined): fact is Fact<T> & { value: T } => fact !== undefined && fact.value !== null;

export function carryForwardFacts(previous: Facts | null | undefined, next: Facts, modelCompleted: boolean): CarryOver {
  if (modelCompleted || !previous) return { facts: next, carried: [] };
  const carried: string[] = [];
  const facts: Facts = { ...next };
  for (const field of ["yearBuilt", "losses"] as const) {
    if (!known(next[field]) && known(previous[field])) { facts[field] = { ...previous[field] }; carried.push(FIELD_LABELS[field]); }
  }
  const before = previous.appetite;
  if (before?.fields && next.appetite?.value) {
    const fields = { ...next.appetite.fields };
    const value = { ...next.appetite.value };
    for (const field of APPETITE_FIELDS as readonly AppetiteField[]) {
      const was = before.fields[field];
      if (known(fields[field]) || !known(was)) continue;
      fields[field] = { ...was };
      (value as Record<AppetiteField, unknown>)[field] = was.value;
      carried.push(FIELD_LABELS[field]);
    }
    if (carried.length) facts.appetite = { ...next.appetite, value: value as NonNullable<Facts["appetite"]>["value"], fields };
  }
  return { facts, carried };
}
