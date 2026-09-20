import type { CaseAppetite } from "./case-appetite";
import type { RankedSubmission } from "../federato/scoring";
import type { PropertyContext } from "../agent/property-context";

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

export type Fact<T> = { value: T | null; source: string; confidence: number };

export type Facts = {
  state: Fact<string>;
  tiv: Fact<number>;
  yearBuilt: Fact<number>;
  losses: Fact<number>;
  appetite?: Fact<CaseAppetite & { account: string }>;
};

export type Finding = {
  id: string;
  label: string;
  result: "pass" | "refer" | "unknown";
  detail: string;
  source: string;
};

export type EvidenceSignal = { kind: "yearBuilt" | "constructionType" | "floodZone" | "sprinklered" | "occupancy" | "squareFeet"; value: string | number | boolean; quote: string };
export type PublicEvidence = { url: string; title: string; excerpt: string; signals?: EvidenceSignal[] };

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
  decision: string | null;
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
