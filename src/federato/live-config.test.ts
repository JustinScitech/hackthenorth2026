import assert from "node:assert/strict";
import test from "node:test";
import { liveConfiguration } from "./config";
import { runTriage } from "./triage";

const schema = {
  Policy: { type: "object", fields: {
    id: { type: "number" }, account_name: { type: "string" }, state: { type: "string" },
    business_type: { type: "string" }, line_of_business: { type: "string" }, tiv: { type: "number" },
    premium: { type: "number" }, year_built: { type: "number" }, acceptable_construction_percent: { type: "number" },
    five_year_loss_value: { type: "number" }, effective_date: { type: "string" }, expiration_date: { type: "string" },
  } },
};
const row = { id: 42, account_name: "Fixture Property", state: "CA", business_type: "new", line_of_business: "property", tiv: 75_000_000, premium: 85_000, year_built: 2015, acceptable_construction_percent: 80, five_year_loss_value: 0, effective_date: "2026-01-01", expiration_date: "2027-01-01" };

test("live configuration runs schema discovery and ranks evidence", async () => {
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
    const { client, options } = liveConfiguration();
    const report = await runTriage(client, options);
    assert.equal(report.resource, "Policy");
    assert.equal(report.evaluated, 1);
    assert.equal(report.topSubmissions[0].id, "42");
    assert.equal(report.topSubmissions[0].score, 94);
    assert.equal(report.topSubmissions[0].criteria.find((item) => item.factor === "Submission type")?.status, "acceptable");
    const firstQuery = report.trace[0];
    assert.ok(firstQuery);
    assert.ok(firstQuery.query.select && !Array.isArray(firstQuery.query.select) && firstQuery.query.select.account_name);
  } finally {
    if (previous.id === undefined) delete process.env.FEDERATO_CLIENT_ID; else process.env.FEDERATO_CLIENT_ID = previous.id;
    if (previous.secret === undefined) delete process.env.FEDERATO_CLIENT_SECRET; else process.env.FEDERATO_CLIENT_SECRET = previous.secret;
    globalThis.fetch = previous.fetch;
  }
});
