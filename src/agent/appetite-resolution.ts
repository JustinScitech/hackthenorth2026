import { brokerAppetite, mergeCaseAppetite, type CaseAppetite } from "../lib/case-appetite";
import type { AppetiteFieldFacts, AppetiteFieldValue, Fact, FactCandidate } from "../lib/types";
import { APPETITE_FIELDS, type AppetiteField } from "./extraction-schema";
import type { Resolved } from "./resolution";

/** What the readers resolved per appetite field from the joined broker text, as `extractNotes` reports it. */
export type ExtractedAppetite = Partial<Record<AppetiteField, Pick<Resolved<AppetiteFieldValue>, "value" | "source" | "confidence" | "quote" | "candidates">>>;
export type ResolvedAppetite = { value: CaseAppetite; fields: AppetiteFieldFacts };

const notProvided: Fact<AppetiteFieldValue> = { value: null, source: "Not provided", confidence: 0 };
/** The parser alone backs an explicit line, so it carries the same confidence the resolver gives a lone parser value. */
const LINE_CONFIDENCE = 0.6;

/** The last explicit "Field: value" line per appetite field, so a parser-backed fact can cite it. */
function appetiteLines(text: string): Partial<Record<AppetiteField, string>> {
  const lines: Partial<Record<AppetiteField, string>> = {};
  for (const line of text.split(/\r?\n/)) for (const key of Object.keys(brokerAppetite(line)) as AppetiteField[]) lines[key] = line.trim();
  return lines;
}

/**
 * The same merge as `mergeCaseAppetite`, with each field's provenance kept:
 * where the value came from, how confident the readers were, the sentence or
 * line it was taken from, and every reader that disagreed with what won.
 */
export function resolveCaseAppetite(originalNotes: string, intake: Partial<CaseAppetite> | null | undefined, brokerReplies = "", extracted: ExtractedAppetite = {}): ResolvedAppetite {
  const value = mergeCaseAppetite(originalNotes, intake, brokerReplies, extracted);
  const original = brokerAppetite(originalNotes);
  const replies = brokerAppetite(brokerReplies);
  const originalLines = appetiteLines(originalNotes);
  const replyLines = appetiteLines(brokerReplies);
  const fields: AppetiteFieldFacts = {};
  for (const field of APPETITE_FIELDS) {
    const read = extracted[field];
    const readers = (read?.candidates ?? []) as FactCandidate<AppetiteFieldValue>[];
    const fromReaders = (won: AppetiteFieldValue): Fact<AppetiteFieldValue> => ({ value: won, source: `Broker text via ${read!.source}`, confidence: read!.confidence, ...(read!.quote ? { quote: read!.quote } : {}) });
    const withDisagreement = (fact: Fact<AppetiteFieldValue>): Fact<AppetiteFieldValue> => readers.some((candidate) => candidate.value !== fact.value) ? { ...fact, candidates: readers } : fact;
    const supplied = intake?.[field];
    let fact: Fact<AppetiteFieldValue>;
    if (field in replies) {
      const line = replies[field] ?? null;
      fact = line === null ? notProvided : read?.value === line ? fromReaders(line) : { value: line, source: "Broker reply line", confidence: LINE_CONFIDENCE, quote: replyLines[field]! };
    } else if (supplied !== null && supplied !== undefined) {
      fact = { value: supplied, source: "Intake form", confidence: 1 };
    } else if (read && read.value !== null) {
      fact = fromReaders(read.value);
    } else if (field in original) {
      const line = original[field] ?? null;
      fact = line === null ? notProvided : { value: line, source: "Broker note line", confidence: LINE_CONFIDENCE, quote: originalLines[field]! };
    } else {
      fact = notProvided;
    }
    fields[field] = fact.value === null ? { ...notProvided } : withDisagreement(fact);
  }
  return { value, fields };
}
