import { GoogleGenAI } from "@google/genai";
import { EMBEDDING_DIMENSIONS, type CaseMemory, type CaseMemoryStore, type SimilarCase } from "../lib/case-memory";
import { getCase } from "../lib/db";
import { caseMemoryStore } from "../lib/mongo";
import type { CaseRecord, CaseStatus } from "../lib/types";
import { caseBriefing } from "./chat";
import { captureAgentError, logAgentEvent, traceModelCall } from "./monitoring";
import { errorCode } from "./providers";

/**
 * Precedent for a case: the briefing every case already produces is embedded with Gemini and
 * kept in MongoDB (`case_memory`) alongside how the case ended. A case under review asks for
 * its nearest decided neighbours, so the underwriter sees "we have seen this before, and here
 * is what we did". On Atlas the lookup is `$vectorSearch`; anywhere else (local MongoDB has no
 * vector index) it is cosine similarity computed here over the small collection. Nothing in
 * this module throws at a call site: no key means skip, and a model or store failure means
 * an empty answer that is logged, never a failed case job.
 */
export { CASE_MEMORY_COLLECTION, CASE_MEMORY_INDEX, EMBEDDING_DIMENSIONS, type CaseMemory, type CaseMemoryStore, type ReferFinding, type SimilarCase } from "../lib/case-memory";
export const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";
const DEFAULT_K = 3;
const BRIEF_LIMIT = 400;
const DETAIL_LIMIT = 240;
const EMBED_TIMEOUT_MS = 15_000;
const DECIDED: ReadonlySet<CaseStatus> = new Set<CaseStatus>(["approved", "declined"]);

export type SearchPath = "atlas" | "cosine" | "skipped" | "failed";
export type SimilarCasesResult = { path: SearchPath; cases: SimilarCase[]; summary: string | null; reason?: string };
export type EmbedFn = (text: string) => Promise<number[] | null>;

export type SimilarCaseDeps = {
  enabled: () => boolean;
  loadCase: (caseId: string) => Promise<CaseRecord | null>;
  embed: EmbedFn;
  store: CaseMemoryStore;
  log?: (line: string) => void;
};

export function embeddingsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

export function embeddingModel(env: Record<string, string | undefined> = process.env): string {
  return env.GEMINI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
}

/** Atlas connection strings are SRV records under mongodb.net; that is where `$vectorSearch` can exist. */
export function isAtlasUri(uri: string): boolean {
  return /^mongodb\+srv:\/\//i.test(uri) || /\.mongodb\.net(?::\d+)?(?:[/?]|$)/i.test(uri);
}

export function isDecided(memory: Pick<CaseMemory, "status">): boolean {
  return DECIDED.has(memory.status);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let index = 0; index < a.length; index++) { dot += a[index] * b[index]; normA += a[index] * a[index]; normB += b[index] * b[index]; }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

export function normalizeEmbedding(values: number[]): number[] {
  const norm = Math.hypot(...values);
  return norm === 0 ? values.map(() => 0) : values.map((value) => value / norm);
}

function isUsableVector(values: unknown): values is number[] {
  return Array.isArray(values) && values.length > 0 && values.every((value) => typeof value === "number" && Number.isFinite(value));
}

const STOPWORDS = new Set(["the", "a", "an", "and", "or", "of", "on", "in", "at", "to", "for", "is", "are", "was", "with", "by", "from", "as", "it", "this", "that", "its", "be", "has", "have", "not", "no"]);

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Deterministic stand-in for the model embedding: a hashed bag of words and word pairs, unit
 * length, in the same dimension the index expects. Tests and evals use it so ranking, exclusion,
 * and the summary line can be checked without a key; it never replaces Gemini in the product.
 */
export function localEmbedding(text: string, dimensions = EMBEDDING_DIMENSIONS): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = (text.toLowerCase().match(/[a-z]+|\d[\d,.]*/g) ?? []).filter((token) => !STOPWORDS.has(token));
  const counts = new Map<string, number>();
  for (let index = 0; index < tokens.length; index++) {
    counts.set(tokens[index], (counts.get(tokens[index]) ?? 0) + 1);
    if (index + 1 < tokens.length) counts.set(`${tokens[index]} ${tokens[index + 1]}`, (counts.get(`${tokens[index]} ${tokens[index + 1]}`) ?? 0) + 1);
  }
  for (const [token, count] of counts) {
    const hash = fnv1a(token);
    vector[hash % dimensions] += (fnv1a(`${token}#sign`) & 1 ? 1 : -1) * (1 + Math.log(count));
  }
  return normalizeEmbedding(vector);
}

/** Gemini text embedding of one briefing, unit length. Retries a transient status once; throws otherwise. */
export async function geminiEmbedding(text: string, env: Record<string, string | undefined> = process.env): Promise<number[] | null> {
  if (!env.GEMINI_API_KEY) return null;
  const model = embeddingModel(env);
  const gemini = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await traceModelCall("gemini", model, () => gemini.models.embedContent({
        model, contents: text.slice(0, 20_000),
        config: { taskType: "SEMANTIC_SIMILARITY", outputDimensionality: EMBEDDING_DIMENSIONS, httpOptions: { timeout: EMBED_TIMEOUT_MS } },
      }));
      const values = response.embeddings?.[0]?.values;
      if (!isUsableVector(values) || values.length !== EMBEDDING_DIMENSIONS) throw new Error(`Embedding from ${model} is malformed`);
      return normalizeEmbedding(values);
    } catch (error) {
      const status = errorCode(error);
      if (attempt > 0 || !(status === 429 || (status !== undefined && status >= 500))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

/** What gets embedded: the same briefing Astra reads, minus the activity log, whose timestamps carry no similarity. */
export function memoryText(caseRecord: CaseRecord): string {
  return caseBriefing(caseRecord, []);
}

const clip = (text: string, limit: number) => (text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`);

export function toCaseMemory(caseRecord: CaseRecord, embedding: number[], now = new Date()): CaseMemory {
  return {
    caseId: caseRecord.id, embedding, status: caseRecord.status, decision: caseRecord.decision,
    briefSummary: clip(caseRecord.brief ?? "", BRIEF_LIMIT),
    refers: (caseRecord.findings ?? []).filter((finding) => finding.result === "refer").map(({ id, label, detail }) => ({ id, label, detail: clip(detail, DETAIL_LIMIT) })),
    state: caseRecord.state, insuredName: caseRecord.insuredName, analysisRevision: caseRecord.analysisRevision, updatedAt: now.toISOString(),
  };
}

const withoutVector = ({ embedding: _embedding, ...rest }: CaseMemory) => rest;

/** Cosine ranking over the candidates, never returning the case itself; ties fall back to id so the order is stable. */
export function rankBySimilarity(query: number[], candidates: CaseMemory[], { excludeId, k }: { excludeId: string; k: number }): SimilarCase[] {
  return candidates
    .filter((candidate) => candidate.caseId !== excludeId)
    .map((candidate) => ({ ...withoutVector(candidate), score: Math.round(cosineSimilarity(query, candidate.embedding) * 10_000) / 10_000 }))
    .sort((left, right) => right.score - left.score || left.caseId.localeCompare(right.caseId))
    .slice(0, Math.max(0, k));
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

/** "3 similar past cases: 2 approved, 1 declined — the decline cited Building age." The citation is the stored referred findings, verbatim. */
export function summarizeSimilarCases(cases: SimilarCase[]): string | null {
  if (!cases.length) return null;
  const approved = cases.filter((item) => item.status === "approved").length;
  const declined = cases.filter((item) => item.status === "declined").length;
  const undecided = cases.length - approved - declined;
  const counts = [approved && `${approved} approved`, declined && `${declined} declined`, undecided && `${undecided} undecided`].filter((part): part is string => Boolean(part));
  const cited = [...new Set(cases.filter((item) => item.status === "declined").flatMap((item) => item.refers.map((refer) => refer.label)))].slice(0, 4);
  const citation = declined && cited.length ? ` — the decline${declined === 1 ? "" : "s"} cited ${joinList(cited)}` : "";
  return `${cases.length} similar past case${cases.length === 1 ? "" : "s"}: ${counts.join(", ")}${citation}.`;
}

/** The lines caseBriefing appends so Astra can answer "have we written anything like this before?". */
export function precedentLines(cases: SimilarCase[]): string[] {
  const summary = summarizeSimilarCases(cases);
  if (!summary) return [];
  return [
    `Similar past cases (precedent, ranked by similarity): ${summary}`,
    ...cases.map((item) => {
      const referred = item.refers.length ? ` Referred: ${item.refers.map((refer) => `${refer.label} (${refer.detail})`).join("; ")}.` : "";
      return `- ${item.insuredName} (${item.state ?? "state unknown"}, ${item.status}${item.decision ? `: ${item.decision}` : ""}). ${item.briefSummary}${referred}`;
    }),
  ];
}

/** In-memory store with the same contract as MongoDB; vector search is unavailable, as on local MongoDB. Used by tests and evals. */
export function createMemoryStore(seed: CaseMemory[] = []): CaseMemoryStore {
  const memories = new Map(seed.map((memory) => [memory.caseId, memory]));
  return {
    async get(caseId) { return memories.get(caseId) ?? null; },
    async upsert(memory) { memories.set(memory.caseId, memory); },
    async listDecided(excludeId) { return [...memories.values()].filter((memory) => memory.caseId !== excludeId && isDecided(memory)); },
    async vectorSearch() { throw Object.assign(new Error("Unrecognized pipeline stage name: '$vectorSearch'"), { code: 40324 }); },
  };
}

function defaultDeps(): SimilarCaseDeps {
  return { enabled: embeddingsEnabled, loadCase: getCase, embed: geminiEmbedding, store: caseMemoryStore() };
}

const describe = (error: unknown) => (error instanceof Error ? `${error.name}${errorCode(error) ? ` ${errorCode(error)}` : ""}: ${error.message.slice(0, 120)}` : "unknown error");
const say = (deps: SimilarCaseDeps, line: string) => (deps.log ?? console.info)(line);

export type IndexResult = { indexed: boolean; reason?: string };

/** Embeds the case briefing and stores it with the outcome. Safe to call from a job: it skips without a key and swallows failures. */
export async function indexCaseMemory(caseId: string, deps: SimilarCaseDeps = defaultDeps()): Promise<IndexResult> {
  if (!deps.enabled()) return { indexed: false, reason: "embeddings are not configured" };
  try {
    const caseRecord = await deps.loadCase(caseId);
    if (!caseRecord) return { indexed: false, reason: "case not found" };
    const embedding = await deps.embed(memoryText(caseRecord));
    if (!isUsableVector(embedding)) throw new Error("Embedding is malformed");
    await deps.store.upsert(toCaseMemory(caseRecord, embedding));
    logAgentEvent("case_memory_indexed", { caseId, status: caseRecord.status, dimensions: embedding.length });
    return { indexed: true };
  } catch (error) {
    captureAgentError(error, { caseId, step: "case_memory_index" });
    say(deps, `[similar-cases] could not index case ${caseId}: ${describe(error)}`);
    return { indexed: false, reason: describe(error) };
  }
}

async function queryEmbedding(caseId: string, deps: SimilarCaseDeps): Promise<number[] | null> {
  const stored = await deps.store.get(caseId);
  if (stored && isUsableVector(stored.embedding)) return stored.embedding;
  const caseRecord = await deps.loadCase(caseId);
  if (!caseRecord) return null;
  const embedding = await deps.embed(memoryText(caseRecord));
  if (!isUsableVector(embedding)) return null;
  await deps.store.upsert(toCaseMemory(caseRecord, embedding));
  return embedding;
}

/**
 * The k nearest decided cases to this one. Tries the Atlas index first and falls back to cosine
 * over the collection when the stage is unsupported, the index is missing, or the index has not
 * caught up with a collection that plainly has neighbours; the answer says which path ran.
 */
export async function findSimilarCases(caseId: string, k = DEFAULT_K, deps: SimilarCaseDeps = defaultDeps()): Promise<SimilarCasesResult> {
  const empty = (path: SearchPath, reason: string): SimilarCasesResult => ({ path, cases: [], summary: null, reason });
  if (!deps.enabled()) return empty("skipped", "embeddings are not configured");
  try {
    const embedding = await queryEmbedding(caseId, deps);
    if (!embedding) return empty("skipped", "the case has no embedding");
    let path: SearchPath = "atlas";
    let reason: string | undefined;
    let cases: SimilarCase[] = [];
    try {
      cases = (await deps.store.vectorSearch(embedding, k, caseId)).filter((item) => item.caseId !== caseId && isDecided(item)).slice(0, Math.max(0, k));
    } catch (error) {
      path = "cosine";
      reason = `vector search unavailable: ${describe(error)}`;
    }
    if (path === "cosine" || cases.length === 0) {
      const ranked = rankBySimilarity(embedding, await deps.store.listDecided(caseId), { excludeId: caseId, k });
      if (path === "atlas" && ranked.length) { path = "cosine"; reason = "the vector index returned no matches for a collection that has neighbours"; }
      if (path === "cosine") cases = ranked;
    }
    say(deps, `[similar-cases] ${path} search for case ${caseId}: ${cases.length} match${cases.length === 1 ? "" : "es"}${reason ? ` (${reason})` : ""}`);
    logAgentEvent("similar_cases_found", { caseId, path, matches: cases.length });
    return { path, cases, summary: summarizeSimilarCases(cases), ...(reason ? { reason } : {}) };
  } catch (error) {
    captureAgentError(error, { caseId, step: "similar_cases" });
    say(deps, `[similar-cases] lookup failed for case ${caseId}: ${describe(error)}`);
    return empty("failed", describe(error));
  }
}
