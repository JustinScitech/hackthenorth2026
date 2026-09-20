import assert from "node:assert/strict";
import test from "node:test";
import { caseBriefing } from "./chat";
import {
  cosineSimilarity, createMemoryStore, EMBEDDING_DIMENSIONS, findSimilarCases, indexCaseMemory, localEmbedding, memoryText,
  precedentLines, rankBySimilarity, summarizeSimilarCases, toCaseMemory,
  type CaseMemory, type SimilarCase, type SimilarCaseDeps,
} from "./similar-cases";
import type { CaseRecord } from "../lib/types";

const record = (overrides: Partial<CaseRecord> = {}): CaseRecord => ({
  id: "11111111-1111-4111-8111-111111111111", insuredName: "Harbor Office LLC", state: "NJ", tiv: 4_300_000, yearBuilt: 1998, losses: 0,
  sourceKey: "src", publicSourceUrl: null, address: null, publicEvidence: null, propertyContext: null, sourceCandidates: null, origin: null, extractionConflicts: [],
  status: "approved", facts: null, findings: [
    { id: "state", label: "Territory", result: "pass", detail: "NJ is in appetite", source: "Intake form" },
    { id: "age", label: "Building age", result: "refer", detail: "Built 1921, older than the 1950 guideline", source: "Broker text via Parser" },
    { id: "losses", label: "Loss history", result: "unknown", detail: "No loss run supplied", source: "Intake form" },
  ],
  brief: "Masonry office in Newark. One referral on building age; everything else passes.", question: null, decision: "Approved on the strength of the sprinkler retrofit.",
  reportDraft: null, reportDraftVersion: 0, error: null, analysisRevision: 1, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

const memory = (caseId: string, embedding: number[], overrides: Partial<CaseMemory> = {}): CaseMemory => ({
  caseId, embedding, status: "approved", decision: "Approved.", briefSummary: `Brief for ${caseId}`, refers: [], state: "NJ", insuredName: `Insured ${caseId}`,
  analysisRevision: 1, updatedAt: "2026-09-01T00:00:00.000Z", ...overrides,
});

const similar = (caseId: string, overrides: Partial<SimilarCase> = {}): SimilarCase => {
  const { embedding: _embedding, ...rest } = memory(caseId, []);
  return { ...rest, score: 0.9, ...overrides };
};

/** A deterministic stand-in for the Gemini embedder: the same text always maps to the same unit vector. */
const mockEmbed = async (text: string) => localEmbedding(text);

function deps(overrides: Partial<SimilarCaseDeps> = {}): SimilarCaseDeps & { logged: string[] } {
  const logged: string[] = [];
  return { enabled: () => true, loadCase: async () => record(), embed: mockEmbed, store: createMemoryStore(), log: (line) => logged.push(line), logged, ...overrides };
}

test("cosine similarity: identical vectors score 1, orthogonal 0, degenerate input 0", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  assert.equal(cosineSimilarity([1, 1], [1, 1, 1]), 0);
  assert.ok(Math.abs(cosineSimilarity([1, 0], [2, 0]) - 1) < 1e-9, "scale must not matter");
});

test("local embedding is deterministic, unit length, and puts alike briefs closer than unlike ones", () => {
  const frame = "Texas warehouse, frame construction, two fire losses, declined for loss history";
  const frameAgain = "Texas frame construction warehouse with two fire losses; declined on loss history";
  const masonry = "New Jersey masonry office, sprinklered, no losses, approved";
  const vector = localEmbedding(frame);
  assert.equal(vector.length, EMBEDDING_DIMENSIONS);
  assert.deepEqual(vector, localEmbedding(frame));
  assert.ok(Math.abs(Math.hypot(...vector) - 1) < 1e-9);
  assert.ok(cosineSimilarity(vector, localEmbedding(frameAgain)) > cosineSimilarity(vector, localEmbedding(masonry)));
  assert.ok(localEmbedding("").every((value) => value === 0), "empty text is the zero vector");
});

test("ranking orders by cosine, drops the case itself, honours k, and breaks ties by id", () => {
  const query = [1, 0, 0];
  const candidates = [
    memory("b", [0.5, 0.5, 0]),
    memory("self", [1, 0, 0]),
    memory("a", [0.5, 0.5, 0]),
    memory("c", [0.9, 0.1, 0]),
    memory("d", [0, 1, 0]),
  ];
  const ranked = rankBySimilarity(query, candidates, { excludeId: "self", k: 3 });
  assert.deepEqual(ranked.map((item) => item.caseId), ["c", "a", "b"]);
  assert.ok(ranked.every((item) => !("embedding" in item)), "results carry no vectors");
  assert.ok(ranked[0].score > ranked[1].score && ranked[1].score === ranked[2].score);
  assert.deepEqual(rankBySimilarity(query, [], { excludeId: "self", k: 3 }), []);
});

test("case memory keeps only referred findings, the brief, and the decision", () => {
  const doc = toCaseMemory(record({ brief: "x".repeat(1000) }), [0.1, 0.2], new Date("2026-09-02T00:00:00Z"));
  assert.equal(doc.caseId, record().id);
  assert.deepEqual(doc.refers.map((item) => item.id), ["age"]);
  assert.equal(doc.refers[0].label, "Building age");
  assert.equal(doc.status, "approved");
  assert.equal(doc.decision, "Approved on the strength of the sprinkler retrofit.");
  assert.equal(doc.state, "NJ");
  assert.equal(doc.insuredName, "Harbor Office LLC");
  assert.ok(doc.briefSummary.length <= 400, "brief summary is bounded");
  assert.equal(doc.updatedAt, "2026-09-02T00:00:00.000Z");
  assert.deepEqual(doc.embedding, [0.1, 0.2]);
  assert.deepEqual(toCaseMemory(record({ findings: null, brief: null, decision: null }), [1]).refers, []);
});

test("memory text is the case briefing without the activity log", () => {
  const text = memoryText(record());
  assert.equal(text, caseBriefing(record(), []));
  assert.ok(text.includes("Harbor Office LLC") && text.includes("Building age"));
  assert.ok(!text.includes("Recent activity"));
});

test("summary line counts the set and cites the decline's referred findings", () => {
  const cases = [
    similar("a", { status: "approved" }),
    similar("b", { status: "approved" }),
    similar("c", { status: "declined", decision: "Too old.", refers: [{ id: "age", label: "Building age", detail: "Built 1921" }, { id: "loss", label: "Loss history", detail: "Three fires" }] }),
  ];
  assert.equal(summarizeSimilarCases(cases), "3 similar past cases: 2 approved, 1 declined — the decline cited Building age and Loss history.");
  assert.equal(summarizeSimilarCases([similar("a")]), "1 similar past case: 1 approved.");
  assert.equal(summarizeSimilarCases([similar("c", { status: "declined" })]), "1 similar past case: 1 declined.", "a decline with no referred findings cites nothing");
  assert.equal(summarizeSimilarCases([
    similar("c", { status: "declined", refers: [{ id: "age", label: "Building age", detail: "" }] }),
    similar("d", { status: "declined", refers: [{ id: "age", label: "Building age", detail: "" }, { id: "flood", label: "Flood zone", detail: "" }] }),
  ]), "2 similar past cases: 2 declined — the declines cited Building age and Flood zone.");
  assert.equal(summarizeSimilarCases([]), null);
});

test("precedent lines open with the summary and name each case, and the briefing carries them", () => {
  const cases = [similar("a", { insuredName: "Ridge Storage", state: "TX", status: "declined", decision: "Frame and losses.", refers: [{ id: "loss", label: "Loss history", detail: "Three fires" }] })];
  const lines = precedentLines(cases);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes("1 similar past case: 1 declined — the decline cited Loss history."));
  assert.ok(lines[1].includes("Ridge Storage") && lines[1].includes("TX") && lines[1].includes("declined") && lines[1].includes("Three fires"));
  assert.deepEqual(precedentLines([]), []);
  const briefing = caseBriefing(record(), [], lines);
  assert.ok(briefing.includes(lines[0]) && briefing.includes(lines[1]));
  assert.equal(caseBriefing(record(), []), caseBriefing(record(), [], []), "no precedent leaves the briefing unchanged");
});

test("indexing embeds the briefing and upserts the memory; a second run replaces it", async () => {
  const context = deps();
  assert.deepEqual(await indexCaseMemory(record().id, context), { indexed: true });
  const saved = await context.store.get(record().id);
  assert.ok(saved);
  assert.equal(saved.status, "approved");
  assert.deepEqual(saved.embedding, localEmbedding(memoryText(record())));
  context.loadCase = async () => record({ status: "declined", decision: "Declined." });
  await indexCaseMemory(record().id, context);
  assert.equal((await context.store.get(record().id))?.status, "declined");
  assert.equal((await context.store.listDecided("none")).length, 1);
});

test("indexing skips silently without a key and never throws on model or store failures", async () => {
  assert.deepEqual(await indexCaseMemory("x", deps({ enabled: () => false })), { indexed: false, reason: "embeddings are not configured" });
  const boom = deps({ embed: async () => { throw Object.assign(new Error("quota"), { status: 429 }); } });
  const failed = await indexCaseMemory(record().id, boom);
  assert.equal(failed.indexed, false);
  assert.ok(boom.logged.some((line) => /could not index/.test(line)));
  const malformed = deps({ embed: async () => [Number.NaN, 1] });
  assert.equal((await indexCaseMemory(record().id, malformed)).indexed, false);
  assert.equal(await malformed.store.get(record().id), null, "a malformed vector is never stored");
  const missing = deps({ loadCase: async () => null });
  assert.equal((await indexCaseMemory("nope", missing)).indexed, false);
  const store = createMemoryStore();
  store.upsert = async () => { throw new Error("mongo down"); };
  assert.equal((await indexCaseMemory(record().id, deps({ store }))).indexed, false);
});

test("finding similar cases ranks by cosine, excludes the case itself, and only returns decided cases", async () => {
  const self = record();
  const context = deps();
  const twin = record({ id: "22222222-2222-4222-8222-222222222222", insuredName: "Harbor Office Annex", status: "declined", decision: "Declined for age.", findings: self.findings });
  const stranger = record({ id: "33333333-3333-4333-8333-333333333333", insuredName: "Gulf Coast Cold Storage", state: "TX", brief: "Frame warehouse in Houston, three losses, flood zone AE.", findings: [{ id: "loss", label: "Loss history", result: "refer", detail: "Three losses in three years", source: "Intake form" }] });
  const pending = record({ id: "44444444-4444-4444-8444-444444444444", insuredName: "Harbor Office Twin", status: "review_ready", decision: null });
  for (const item of [self, twin, stranger, pending]) {
    context.loadCase = async () => item;
    await indexCaseMemory(item.id, context);
  }
  context.loadCase = async () => self;
  const result = await findSimilarCases(self.id, 3, context);
  assert.equal(result.path, "cosine");
  assert.deepEqual(result.cases.map((item) => item.caseId), [twin.id, stranger.id]);
  assert.ok(result.cases.every((item) => item.caseId !== self.id));
  assert.ok(result.cases[0].score > result.cases[1].score);
  assert.equal(result.summary, "2 similar past cases: 1 approved, 1 declined — the decline cited Building age.");
  assert.ok(context.logged.some((line) => /cosine/.test(line)), "the path that ran is logged");
  assert.deepEqual((await findSimilarCases(self.id, 1, context)).cases.map((item) => item.caseId), [twin.id]);
});

test("an empty collection yields no cases, no summary, and no error", async () => {
  const context = deps();
  const result = await findSimilarCases(record().id, 3, context);
  assert.deepEqual(result.cases, []);
  assert.equal(result.summary, null);
  assert.equal(result.path, "cosine");
});

test("a case that was never indexed is embedded on the fly and remembered", async () => {
  const context = deps();
  const other = record({ id: "22222222-2222-4222-8222-222222222222", status: "declined" });
  await context.store.upsert(toCaseMemory(other, localEmbedding(memoryText(other))));
  const result = await findSimilarCases(record().id, 3, context);
  assert.deepEqual(result.cases.map((item) => item.caseId), [other.id]);
  assert.ok(await context.store.get(record().id), "the query case is indexed as a side effect");
});

test("vector search is preferred when it answers and falls back to cosine when the index is missing", async () => {
  const context = deps();
  const other = record({ id: "22222222-2222-4222-8222-222222222222", status: "declined" });
  await context.store.upsert(toCaseMemory(other, localEmbedding(memoryText(other))));
  await context.store.upsert(toCaseMemory(record(), localEmbedding(memoryText(record()))));
  context.store.vectorSearch = async () => [similar(other.id, { status: "declined", score: 0.77 }), similar(record().id)];
  const atlas = await findSimilarCases(record().id, 3, context);
  assert.equal(atlas.path, "atlas");
  assert.deepEqual(atlas.cases.map((item) => item.caseId), [other.id], "the case itself is dropped even when the index returns it");
  context.store.vectorSearch = async () => { throw Object.assign(new Error("Unrecognized pipeline stage name: '$vectorSearch'"), { code: 40324 }); };
  const fallback = await findSimilarCases(record().id, 3, context);
  assert.equal(fallback.path, "cosine");
  assert.deepEqual(fallback.cases.map((item) => item.caseId), [other.id]);
  assert.ok(context.logged.some((line) => /vector search unavailable/.test(line)));
  context.store.vectorSearch = async () => [];
  const stale = await findSimilarCases(record().id, 3, context);
  assert.equal(stale.path, "cosine", "an index that returns nothing while the collection has neighbours is treated as not ready");
  assert.deepEqual(stale.cases.map((item) => item.caseId), [other.id]);
});

test("finding similar cases skips without a key and reports failures instead of throwing", async () => {
  assert.deepEqual(await findSimilarCases("x", 3, deps({ enabled: () => false })), { path: "skipped", cases: [], summary: null, reason: "embeddings are not configured" });
  const failing = deps({ embed: async () => { throw new Error("timeout"); } });
  const result = await findSimilarCases(record().id, 3, failing);
  assert.equal(result.path, "failed");
  assert.deepEqual(result.cases, []);
  const store = createMemoryStore();
  store.listDecided = async () => { throw new Error("mongo down"); };
  assert.equal((await findSimilarCases(record().id, 3, deps({ store }))).path, "failed");
});
