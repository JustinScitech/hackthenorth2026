import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";

const schema = {
  Policy: { type: "object", fields: {
    id: { type: "number" }, account_name: { type: "string" }, state: { type: "string" },
    business_type: { type: "string" }, line_of_business: { type: "string" }, tiv: { type: "number" },
    premium: { type: "number" }, year_built: { type: "number" }, acceptable_construction_percent: { type: "number" },
    five_year_loss_value: { type: "number" }, effective_date: { type: "string" }, expiration_date: { type: "string" },
  } },
};
const row = { id: 42, account_name: "Fixture Property", state: "CA", business_type: "new", line_of_business: "property", tiv: 75_000_000, premium: 85_000, year_built: 2015, acceptable_construction_percent: 80, five_year_loss_value: 0, effective_date: "2026-01-01", expiration_date: "2027-01-01" };

test("triage route blocks cross-origin calls before credentials are used", async () => {
  const result = await POST(new Request("http://localhost:3000/api/triage", { method: "POST", headers: { origin: "https://attacker.example" } }));
  assert.equal(result.status, 403);
  assert.match((await result.json()).error, /triage page/i);
});

test("triage route runs the discovered schema and returns ranked evidence", async () => {
  const previous = { id: process.env.FEDERATO_CLIENT_ID, secret: process.env.FEDERATO_CLIENT_SECRET, fetch: globalThis.fetch };
  process.env.FEDERATO_CLIENT_ID = "fixture-client";
  process.env.FEDERATO_CLIENT_SECRET = "fixture-secret";
  globalThis.fetch = (async (input, init) => {
    if (String(input).includes("oauth/token")) return Response.json({ access_token: "fixture-token", expires_in: 3600 });
    const body = JSON.parse(String(init?.body));
    const data = body.action === "schema" ? schema : { total: 1, resource: "Policy", results: [row] };
    return Response.json({ output: [{ data }] });
  }) as typeof fetch;
  try {
    const result = await POST(new Request("http://localhost:3000/api/triage", { method: "POST", headers: { origin: "http://localhost:3000" } }));
    assert.equal(result.status, 200);
    const report = await result.json();
    assert.equal(report.resource, "Policy");
    assert.equal(report.evaluated, 1);
    assert.equal(report.topSubmissions[0].id, "42");
    assert.equal(report.topSubmissions[0].score, 100);
    assert.ok(report.trace[0].query.select.account_name);
    assert.equal("schema" in report, false);
  } finally {
    if (previous.id === undefined) delete process.env.FEDERATO_CLIENT_ID; else process.env.FEDERATO_CLIENT_ID = previous.id;
    if (previous.secret === undefined) delete process.env.FEDERATO_CLIENT_SECRET; else process.env.FEDERATO_CLIENT_SECRET = previous.secret;
    globalThis.fetch = previous.fetch;
  }
});
