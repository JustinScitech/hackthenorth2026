import assert from "node:assert/strict";
import test from "node:test";
import { FederatoClient, type DataClient, type Query } from "./client";
import { planQuery } from "./schema";
import { scoreSubmission } from "./scoring";
import { runTriage } from "./triage";

const fields = {
  id: { type: "number" }, account_name: { type: "string" }, primary_risk_state: { type: "string" }, business_type: { type: "string" }, line_of_business: { type: "string" },
  tiv: { type: "number" }, premium: { type: "number" }, year_built: { type: "number" }, acceptable_construction_percent: { type: "number" }, five_year_loss_value: { type: "number" }, effective_date: { type: "string" }, expiration_date: { type: "string" },
};
const schema = { Policy: { type: "object", fields } };
const good = { id: 1, account_name: "Example property", primary_risk_state: "CA", business_type: "new", line_of_business: "property", tiv: 75_000_000, premium: 85_000, year_built: 2015, acceptable_construction_percent: 75, five_year_loss_value: 0, effective_date: "2026-01-01", expiration_date: "2027-01-01" };
const plan = planQuery(schema);
const score = (changes: Record<string, unknown> = {}) => scoreSubmission({ ...good, ...changes }, plan.mapping);

test("supplied appetite submission is fully verified with explanations and sources", () => {
  const result = score();
  assert.equal(result.score, 94);
  assert.equal(result.recommendation, "Review for acceptance");
  assert.equal(result.criteria.find((item) => item.factor === "Submission type")?.status, "acceptable");
  assert.equal(result.criteria.find((item) => item.factor === "Line of business")?.status, "acceptable");
  assert.equal(result.criteria.find((item) => item.factor === "Total insured value")?.source, "tiv");
});

test("hard exceptions cannot be outweighed by target matches", () => {
  for (const changes of [{ primary_risk_state: "NY" }, { tiv: 150_000_001 }, { premium: 49_999 }, { premium: 175_001 }, { year_built: 1989 }, { five_year_loss_value: 100_001 }, { acceptable_construction_percent: 49 }, { line_of_business: "auto" }]) {
    const result = score(changes);
    assert.ok(result.score <= 49);
    assert.equal(result.recommendation, "Refer for appetite exceptions");
    assert.match(result.explanation, /Exceptions:/);
  }
});

test("renewals are outside appetite while new business remains acceptable", () => {
  for (const business of ["renewal", "renewal business", "Renewal_Business"]) {
    const result = score({ business_type: business });
    assert.equal(result.criteria.find((item) => item.factor === "Submission type")?.status, "outside");
    assert.equal(result.recommendation, "Refer for appetite exceptions");
    assert.equal(result.rawScore, 86);
    assert.equal(result.score, 49);
  }
  assert.equal(score({ business_type: "new" }).criteria.find((item) => item.factor === "Submission type")?.status, "acceptable");
  assert.equal(score({ business_type: "new" }).recommendation, "Review for acceptance");
});

test("inclusive limits, target ranges, and unspecified boundaries follow the PDF", () => {
  for (const changes of [{ tiv: 150_000_000 }, { premium: 50_000 }, { premium: 175_000 }, { year_built: 1991 }, { year_built: 2010 }, { primary_risk_state: "UT" }]) {
    assert.equal(score(changes).criteria.filter((c) => c.status === "outside" || c.status === "unknown").length, 0);
  }
  for (const changes of [{ year_built: 1990 }, { acceptable_construction_percent: 50 }, { five_year_loss_value: 100_000 }]) {
    assert.equal(score(changes).recommendation, "Investigate missing or ambiguous data");
    assert.ok(score(changes).score <= 69);
  }
});

test("missing, invalid, incomplete, and contradictory facts never become passes", () => {
  for (const changes of [{ premium: null }, { premium: "85000" }, { tiv: -1 }, { year_built: 9999 }, { five_year_loss_value: undefined }, { acceptable_construction_percent: 101 }, { effective_date: "unknown" }, { expiration_date: "2020-01-01" }, { account_name: "" }]) {
    assert.ok(score(changes).score <= 69);
    assert.ok(score(changes).missingData.length > 0);
  }
});

test("discovers nested references and arrays without guessing totals or primary state", () => {
  const nested = {
    Policy: { type: "object", fields: {
      id: fields.id,
      insured: { type: "reference", resource: "Account", cardinality: "one" },
      locations: { type: "reference", resource: "Location", cardinality: "many" },
    } },
    Account: { type: "object", fields: { name: { type: "string" } } },
    Location: { type: "object", fields: {
      state: { type: "string" },
      buildings: { type: "array", itemSchema: { type: "object", fields: {
        year_built: { type: "number" }, tiv: { type: "number" },
      } } },
    } },
  };
  const p = planQuery(nested);
  assert.equal(p.mapping.year, "locations.buildings.year_built");
  assert.equal(p.mapping.account, "insured.name");
  assert.equal(p.mapping.tiv, undefined);
  assert.equal(p.mapping.state, undefined);
  assert.deepEqual(p.select.locations, { $expand: { select: { buildings: { year_built: true } } } });
  const result = scoreSubmission({ id: 1, insured: { name: "Example" }, locations: [{ buildings: [{ year_built: 2015 }, {}] }] }, p.mapping);
  assert.equal(result.criteria.find((c) => c.factor === "Building age")?.status, "unknown");
  const old = scoreSubmission({ id: 1, locations: [{ buildings: [{ year_built: 2015 }, { year_built: 1980 }] }] }, p.mapping);
  assert.equal(old.criteria.find((c) => c.factor === "Building age")?.status, "outside");
  assert.throws(() => planQuery(nested, { mapping: { tiv: "locations.buildings.tiv" } }), /array/);
});

test("mapping overrides must exist in discovered schema and ambiguity remains visible", () => {
  assert.throws(() => planQuery(schema, { mapping: { premium: "made_up" } }), /undiscovered/);
  const ambiguous = { Policy: { type: "object", fields: { ...fields, total_premium: { type: "number" } } } };
  assert.equal(planQuery(ambiguous).mapping.premium, undefined);
  assert.equal(planQuery(ambiguous, { mapping: { premium: "total_premium" } }).mapping.premium, "total_premium");
  assert.throws(() => planQuery({ ...schema, Submission: schema.Policy }), /ambiguous/);
});

function fixture(rows: Record<string, unknown>[]): DataClient {
  return { schema: async () => schema, query: async (q) => ({ rows: rows.slice(q.pagination?.offset ?? 0, (q.pagination?.offset ?? 0) + (q.pagination?.limit ?? rows.length)), total: rows.length }) };
}
test("capped exceptions retain match-score ordering and deterministic ties", async () => {
  const report = await runTriage(fixture([
    { ...good, id: 1, business_type: "renewal", premium: 60_000 },
    { ...good, id: 3, business_type: "renewal" },
    { ...good, id: 2, business_type: "renewal" },
  ]));
  assert.deepEqual(report.ranked.map((item) => item.id), ["2", "3", "1"]);
  assert.deepEqual(report.ranked.map((item) => item.score), [49, 49, 49]);
  assert.deepEqual(report.ranked.map((item) => item.rawScore), [86, 86, 83]);
});
test("ranks the entire 123-record queue before taking top N and exposes each query", async () => {
  const rows = Array.from({ length: 123 }, (_, index) => ({ ...good, id: index + 1, premium: index === 122 ? 85_000 : 60_000 }));
  const report = await runTriage(fixture(rows));
  assert.equal(report.evaluated, 123);
  assert.equal(report.trace.length, 3);
  assert.equal(report.topSubmissions[0].id, "123");
  assert.equal(report.topSubmissions.length, 20);
  assert.equal(report.truncated, false);
  assert.deepEqual(report.trace.map((q) => q.query.pagination?.offset), [0, 50, 100]);
});

test("partial queues are labeled; empty, repeated, and changing pages are handled", async () => {
  const rows = Array.from({ length: 60 }, (_, id) => ({ ...good, id }));
  const partial = await runTriage(fixture(rows), { maxRecords: 50 });
  assert.equal(partial.truncated, true);
  assert.equal((await runTriage(fixture([]))).evaluated, 0);
  await assert.rejects(runTriage({ schema: async () => schema, query: async () => ({ rows: [], total: 1 }) }), /empty page/);
  await assert.rejects(runTriage(fixture([{ ...good }, { ...good }])), /repeated/);
  const changing: DataClient = { schema: async () => schema, query: async (q) => ({ rows: rows.slice(q.pagination?.offset ?? 0, (q.pagination?.offset ?? 0) + 50), total: q.pagination?.offset ? 61 : 60 }) };
  await assert.rejects(runTriage(changing), /changed/);
});

test("client uses documented Auth0 domain, envelopes, token caching and 401 refresh", async () => {
  const calls: { url: string; body: Record<string, unknown>; authorization: string | null }[] = [];
  let minted = 0, apiCalls = 0;
  const request: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)), authorization: new Headers(init?.headers).get("Authorization") });
    if (String(url).includes("oauth/token")) { minted++; return Response.json({ access_token: `token-${minted}`, expires_in: 14400 }); }
    apiCalls++;
    if (apiCalls === 2) return new Response("unauthorized", { status: 401 });
    return Response.json(apiCalls === 1 ? schema : { total: 1, groups: [good] });
  };
  const client = new FederatoClient({ clientId: "test-id", clientSecret: "test-secret" }, request);
  await client.schema();
  const result = await client.query({ resource: "Policy", pagination: { limit: 50, offset: 0 } });
  assert.equal(result.rows.length, 1);
  assert.equal(minted, 2);
  assert.equal(calls[0].url, "https://auth.product.federato.ai/oauth/token");
  assert.equal(calls[0].body.audience, "https://product.federato.ai/core-api");
  assert.deepEqual(calls[1].body, { action: "schema" });
  assert.equal(calls.at(-1)?.authorization, "Bearer token-2");
  assert.ok(calls.at(-1)?.url.endsWith("?outputOnly=true"));
});

test("client rejects invalid responses and does not expose upstream secrets", async () => {
  const client = new FederatoClient({ clientId: "id", clientSecret: "secret" }, async () => new Response("secret upstream content", { status: 401 }));
  await assert.rejects(client.schema(), (error: Error) => !error.message.includes("secret upstream content") && /authentication/.test(error.message));
  const malformed = new FederatoClient({ clientId: "id", clientSecret: "secret" }, async (url) => Response.json(String(url).includes("oauth/token") ? { access_token: "token", expires_in: 14400 } : { data: [good] }));
  await assert.rejects(malformed.query({ resource: "Policy", pagination: { limit: 50, offset: 0 } }), /Unexpected Federato query response/);
});

test("client forwards the documented query pipeline without changing array clauses", async () => {
  const sent: unknown[] = [];
  const client = new FederatoClient({ clientId: "fixture", clientSecret: "fixture" }, async (url, init) => {
    if (String(url).includes("oauth/token")) return Response.json({ access_token: "fixture", expires_in: 14400 });
    sent.push(JSON.parse(String(init?.body)));
    return Response.json({ total: 2, results: [{ id: 7 }] });
  });
  const query: Query = {
    resource: "Policy",
    where: { status: { $ne: "expired" } },
    expand: { exposure_units: { location: true } },
    unwind: [{ path: "exposure_units", type: "left" }],
    filter: { exposure_units: { $elemMatch: { kind: "location", location: { hazard_tags: { $in: ["wildfire"] } } } } },
    over: ["id", "exposure_units.id"],
    select: { id: true, totalTiv: { $sum: "exposure_units.basis_amount" } },
    sort: [{ field: "totalTiv", direction: "desc" }],
    pagination: { limit: 1, offset: 1 },
  };
  assert.deepEqual(await client.query(query), { total: 2, rows: [{ id: 7 }] });
  assert.deepEqual(sent, [{ action: "query", payload: query }]);
});
