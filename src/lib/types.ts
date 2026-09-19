export type CaseStatus =
  | "received"
  | "extracting"
  | "checking"
  | "waiting_for_broker"
  | "review_ready"
  | "approved"
  | "declined"
  | "failed";

export type Fact<T> = { value: T | null; source: string; confidence: number };

export type Facts = {
  state: Fact<string>;
  tiv: Fact<number>;
  yearBuilt: Fact<number>;
  losses: Fact<number>;
};

export type Finding = {
  id: string;
  label: string;
  result: "pass" | "refer" | "unknown";
  detail: string;
  source: string;
};

export type CaseRecord = {
  id: string;
  insuredName: string;
  state: string;
  tiv: number;
  yearBuilt: number | null;
  losses: number | null;
  sourceKey: string;
  publicSourceUrl: string | null;
  publicEvidence: { url: string; title: string; excerpt: string } | null;
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
