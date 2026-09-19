import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCases } from "./load-cases";

test("retries an empty case response and returns the recovered list", async () => {
  const responses = [
    new Response("", { status: 502 }),
    Response.json({ cases: [{ id: "case-1" }] }),
  ];
  const fetcher = async () => responses.shift()!;

  const cases = await loadCases(fetcher as typeof fetch);
  assert.equal(cases[0]?.id, "case-1");
  assert.equal(responses.length, 0);
});

test("reports a persistent empty response with its HTTP status", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return new Response("", { status: 503 }); };

  await assert.rejects(loadCases(fetcher as typeof fetch), /empty response \(HTTP 503\)/);
  assert.equal(calls, 2);
});

test("shows a JSON API error without retrying", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return Response.json({ error: "Cases are unavailable." }, { status: 503 }); };

  await assert.rejects(loadCases(fetcher as typeof fetch), /Cases are unavailable/);
  assert.equal(calls, 1);
});

test("reports a malformed successful response", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return new Response("<html>error</html>", { status: 200, headers: { "content-type": "text/html" } }); };

  await assert.rejects(loadCases(fetcher as typeof fetch), /invalid response \(HTTP 200\)/);
  assert.equal(calls, 2);
});

test("retries a truncated JSON response", async () => {
  const responses = [new Response('{"cases":', { status: 200 }), Response.json({ cases: [{ id: "case-2" }] })];
  const fetcher = async () => responses.shift()!;

  const cases = await loadCases(fetcher as typeof fetch);
  assert.equal(cases[0]?.id, "case-2");
});
