import type { CaseAppetite } from "./case-appetite";
import type { RankedSubmission } from "../federato/scoring";
import type { PropertyContext } from "../agent/property-context";
import type { SourceCandidate } from "../agent/source-discovery";

export type CaseStatus =
  | "received"
  | "extracting"
  | "checking"
  | "waiting_for_broker"
  | "review_ready"
  | "approved"
  | "declined"
  | "failed";

export type JobStatus = "QUEUED" | "RUNNING" | "WAITING" | "COMPLETED" | "FAILED";

/** A source that stated a value for a fact, kept when sources disagree so the reviewer sees the alternatives. */
export type FactCandidate<T> = { source: string; value: T; quote?: string };
export type Fact<T> = {
  value: T | null;
  source: string;
  confidence: number;
  /** The verbatim sentence or line of broker text the value was taken from, when a reader supplied one. */
  quote?: string;
  /** Present only when at least one reader disagrees with the value shown. */
  candidates?: FactCandidate<T>[];
};

export type AppetiteFieldValue = string | number | boolean;
export type AppetiteFieldFacts = Partial<Record<keyof CaseAppetite, Fact<AppetiteFieldValue>>>;

export type Facts = {
  state: Fact<string>;
  tiv: Fact<number>;
  yearBuilt: Fact<number>;
  losses: Fact<number>;
  /** The merged appetite evidence, with per-field provenance under `fields` once extraction has resolved each one. */
  appetite?: Fact<CaseAppetite & { account: string }> & { fields?: AppetiteFieldFacts };
};

export type Finding = {
  id: string;
  label: string;
  result: "pass" | "refer" | "unknown";
  detail: string;
  source: string;
};

/** `agreement` records who read the fact: the regex parser, the model pass, or both (see agent/evidence-model.ts). */
export type EvidenceSignal = { kind: "yearBuilt" | "constructionType" | "floodZone" | "sprinklered" | "occupancy" | "squareFeet"; value: string | number | boolean; quote: string; agreement?: "parser" | "model" | "both" };
export type EvidenceModelRun = { source: "Gemini"; model: string; status: "not_configured" | "completed" | "failed"; durationMs: number; dropped: number };
/** `conflicts` are parser/model disagreements on the same page, worded like extraction conflicts; the parser value stays in `signals`. */
export type PublicEvidence = { url: string; title: string; excerpt: string; signals?: EvidenceSignal[]; conflicts?: string[]; extraction?: EvidenceModelRun };
export type { SourceCandidate };

/** The agent's email to the broker: pending until the underwriter approves it, edited when they changed the text first. Approval is the "send"; no mail leaves the workspace. */
export type DraftStatus = "pending" | "approved" | "edited";

export type ReportSection = { id: string; title: string; body: string };
export type ReportDraft = { sections: ReportSection[]; analysisRevision: number; editedBy: string; updatedAt: string };

/** Where a case came from when it was opened from the live Federato queue. */
export type CaseOrigin = { system: "federato"; resource: string; id: string; rank: number; of: number; rankedAt: string; lifecycleStatus?: string; evidenceNote?: string };

export type CaseRecord = {
  id: string;
  insuredName: string;
  state: string | null;
  tiv: number | null;
  yearBuilt: number | null;
  losses: number | null;
  appetite?: CaseAppetite;
  appetiteResult?: RankedSubmission | null;
  sourceKey: string;
  publicSourceUrl: string | null;
  /** Ranked assessor / property-record pages found by discovery when no source URL was supplied; the underwriter confirms one. */
  sourceCandidates: SourceCandidate[] | null;
  address: string | null;
  publicEvidence: PublicEvidence | null;
  propertyContext: PropertyContext | null;
  origin: CaseOrigin | null;
  extractionConflicts: string[];
  status: CaseStatus;
  facts: Facts | null;
  findings: Finding[] | null;
  brief: string | null;
  question: string | null;
  draftEmail: string | null;
  draftStatus: DraftStatus | null;
  decision: string | null;
  reportDraft: ReportDraft | null;
  reportDraftVersion: number;
  error: string | null;
  analysisRevision: number;
  createdAt: string;
  updatedAt: string;
};

export type AuditEvent = {
  id: string;
  eventType: string;
  detail: Record<string, unknown>;
  createdAt: string;
};
