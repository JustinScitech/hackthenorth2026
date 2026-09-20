import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSimilarCases } from "./load-similar-cases";

const match = { caseId: "22222222-2222-4222-8222-222222222222", status: "declined", decision: "Too old.", briefSummary: "Brief.", refers: [{ id: "age", label: "Building age", detail: "1921" }], state: "NJ", insuredName: "Annex", analysisRevision: 1, updatedAt: "2026-09-01T00:00:00.000Z", score: 0.91 };

test("returns the precedent payload from the similar-cases route", async () => {
  let url = "";
  const fetcher = (async (input: string | URL | Request) => { url = String(input); return Response.json({ path: "cosine", cases: [match], summary: "1 similar past case: 1 declined — the decline cited Building age." }); }) as typeof fetch;
  const result = await loadSimilarCases("11111111-1111-4111-8111-111111111111", fetcher);
  assert.equal(url, "/api/cases/11111111-1111-4111-8111-111111111111/similar");
  assert.equal(result.path, "cosine");
  assert.deepEqual(result.cases, [match]);
  assert.match(result.summary ?? "", /1 similar past case/);
});

test("an error status, malformed body, or network failure reads as nothing to show", async () => {
  for (const fetcher of [
    async () => new Response("", { status: 503 }),
    async () => Response.json({ error: "Case is unavailable." }, { status: 503 }),
    async () => new Response("<html>", { status: 200 }),
    async () => Response.json({ path: "atlas" }),
    async () => { throw new TypeError("Failed to fetch"); },
  ]) {
    const result = await loadSimilarCases("11111111-1111-4111-8111-111111111111", fetcher as typeof fetch);
    assert.deepEqual(result.cases, []);
    assert.equal(result.summary, null);
  }
});

test("a skipped lookup keeps its path so the page can stay quiet", async () => {
  const result = await loadSimilarCases("x", (async () => Response.json({ path: "skipped", cases: [], summary: null, reason: "embeddings are not configured" })) as typeof fetch);
  assert.equal(result.path, "skipped");
  assert.equal(result.reason, "embeddings are not configured");
});
