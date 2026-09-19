import type { Facts, Finding } from "../lib/types";
import type { PublicEvidence } from "./public-source";

export type SignalKind = "yearBuilt" | "constructionType" | "floodZone" | "sprinklered" | "occupancy" | "squareFeet";
/** A structured fact read from a public page, with the sentence it came from so an underwriter can check it. */
export type EvidenceSignal = { kind: SignalKind; value: string | number | boolean; quote: string };

export function extractEvidenceSignals(_pageText: string): EvidenceSignal[] {
  throw new Error("extractEvidenceSignals is not implemented yet");
}

/** Turns public-source signals into findings that corroborate, contradict, or add to the broker facts. */
export function evidenceFindings(_facts: Facts, _evidence: PublicEvidence, _signals: EvidenceSignal[]): Finding[] {
  throw new Error("evidenceFindings is not implemented yet");
}
