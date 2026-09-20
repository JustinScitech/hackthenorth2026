import type { CaseStatus } from "./types";

/**
 * The contract between similar-cases.ts (ranking, embedding, summary) and mongo.ts (the
 * `case_memory` collection). It lives on its own so neither module has to import the other
 * at load time.
 */
export const EMBEDDING_DIMENSIONS = 768;
export const CASE_MEMORY_COLLECTION = "case_memory";
export const CASE_MEMORY_INDEX = "case_memory_vector";

export type ReferFinding = { id: string; label: string; detail: string };

/** One remembered case: its vector and what an underwriter wants to know about how it ended. */
export type CaseMemory = {
  caseId: string;
  embedding: number[];
  status: CaseStatus;
  decision: string | null;
  briefSummary: string;
  refers: ReferFinding[];
  state: string | null;
  insuredName: string;
  analysisRevision: number;
  updatedAt: string;
};

export type SimilarCase = Omit<CaseMemory, "embedding"> & { score: number };

export type CaseMemoryStore = {
  get(caseId: string): Promise<CaseMemory | null>;
  upsert(memory: CaseMemory): Promise<void>;
  /** Every approved or declined case except `excludeId`, vectors included, for the in-app ranking. */
  listDecided(excludeId: string): Promise<CaseMemory[]>;
  /** Atlas `$vectorSearch`; throws wherever the stage or the index does not exist. */
  vectorSearch(embedding: number[], k: number, excludeId: string): Promise<SimilarCase[]>;
};
