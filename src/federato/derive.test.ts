import assert from "node:assert/strict";
import test from "node:test";
import { deriveFacts } from "./derive";
import { planQuery } from "./schema";
import { FederatoClient } from "./client";

const n = { type: "number" }, s = { type: "string" };
const schema = {
  Policy: { type: "object", fields: {
    id: n, premium: n, currency: s, business_type: s, line_of_business: s,
    exposure_units: { type: "reference", resource: "Exposure", cardinality: "many" },
    claims: { type: "reference", resource: "Claim", cardinality: "many" },
  } },
  Exposure: { type: "object", fields: { location: { type: "reference", resource: "Location", cardinality: "one" } } },
  Location: { type: "object", fields: { id: n, state: s, buildings: { type: "reference", resource: "Building", cardinality: "many" } } },
  Building: { type: "object", fields: { id: n, year_built: n, tiv: n, construction_type: s } },
  Claim: { type: "object", fields: { id: n, date_of_loss: s, paid_indemnity: n, paid_expense: n, reserve_indemnity: n, reserve_expense: n } },
};
const plan = planQuery(schema);
const asOf = new Date("2026-09-19T00:00:00Z");
const building = { id: 1, tiv: 75_000_000, year_built: 2015, construction_type: "joisted_masonry" };
const location = { id: 1, state: "CA", buildings: [building] };
const claim = { id: 1, date_of_loss: "2025-01-01", paid_indemnity: 60_000, paid_expense: 0, reserve_indemnity: 50_000, reserve_expense: 0 };

test("derives exposure totals without double counting and documents construction weighting", () => {
  const result = deriveFacts({ currency: "USD", exposure_units: [{ location }, { location }], claims: [claim, claim] }, plan, asOf);
  assert.deepEqual(result.row.__derived, { tiv: 75_000_000, constructionPercent: 100, state: "CA", lossValue: 110_000 });
  assert.match(result.sources.constructionPercent ?? "", /building count/);
  assert.equal(result.lossLowerBound, 110_000);
});

test("multi-state, missing exposures, unknown construction and non-USD amounts stay unknown", () => {
  const mixed = deriveFacts({ currency: "USD", exposure_units: [{ location }, { location: { ...location, id: 2, state: "PA" } }] }, plan, asOf);
  assert.equal(mixed.row.__derived.state, null);
  const incomplete = deriveFacts({ currency: "USD", exposure_units: [{ location }, { location: null }] }, plan, asOf);
  assert.equal(incomplete.mapping.tiv, undefined);
  const unfamiliar = deriveFacts({ currency: "USD", exposure_units: [{ location: { ...location, buildings: [{ ...building, construction_type: "unknown" }] } }] }, plan, asOf);
  assert.equal(unfamiliar.row.__derived.constructionPercent, null);
  const foreign = deriveFacts({ currency: "CAD", exposure_units: [{ location }] }, plan, asOf);
  assert.equal(foreign.row.__derived.tiv, null);
  assert.equal(foreign.row.__derived.premium, null);
});

test("live steel-frame labels count as eligible without classifying unfamiliar labels", () => {
  for (const construction of ["Steel Frame", "steel_frame", "steel-frame"]) {
    const result = deriveFacts({ currency: "USD", exposure_units: [{ location: { ...location, buildings: [{ ...building, construction_type: construction }] } }] }, plan, asOf);
    assert.equal(result.row.__derived.constructionPercent, 100);
  }
  const mixed = deriveFacts({ currency: "USD", exposure_units: [{ location: { ...location, buildings: [
    { ...building, construction_type: "Steel Frame" },
    { ...building, id: 2, construction_type: "Wood Frame" },
  ] } }] }, plan, asOf);
  assert.equal(mixed.row.__derived.constructionPercent, 50);
});

test("claims are windowed, deduplicated, and calculate the available five-year incurred value", () => {
  const result = deriveFacts({ currency: "USD", claims: [{ ...claim, paid_indemnity: 1, reserve_indemnity: 0 }, { ...claim, id: 2, date_of_loss: "2020-01-01" }, { ...claim, id: 3, date_of_loss: "2027-01-01" }] }, plan, asOf);
  assert.equal(result.lossLowerBound, 1);
  assert.equal(result.row.__derived.lossValue, null);
  assert.equal(deriveFacts({ currency: "USD", claims: [] }, plan, asOf).row.__derived.lossValue, null);
  assert.equal(deriveFacts({ currency: "USD", claims: [{ ...claim, date_of_loss: "invalid" }] }, plan, asOf).row.__derived.lossValue, null);
  assert.equal(deriveFacts({ currency: "USD", claims: [{ ...claim, date_of_loss: "2026-02-30" }] }, plan, asOf).row.__derived.lossValue, null);
  assert.equal(deriveFacts({ currency: "USD", claims: [{ ...claim, paid_expense: null }] }, plan, asOf).row.__derived.lossValue, null);
});

test("prefers actual submissions and permits explicit policy scope", () => {
  const discovered = { ...schema, Submission: { type: "object", fields: { id: n, line_of_business: s } } };
  assert.equal(planQuery(discovered).resource, "Submission");
  assert.equal(planQuery(discovered, { resource: "Policy" }).resource, "Policy");
  assert.equal(planQuery(discovered, { resource: "Submission" }).resource, "Submission");
});

test("uses a direct primary state field when the discovered schema provides one", () => {
  const direct = { Policy: { type: "object", fields: { id: n, state: s, premium: n } } };
  const directPlan = planQuery(direct);
  assert.equal(directPlan.mapping.state, "state");
  assert.equal(directPlan.derivations.locations, undefined);
});

test("supports live wrapped schema and ungrouped results even with outputOnly=true", async () => {
  const client = new FederatoClient({ clientId: "fixture", clientSecret: "fixture" }, async (url, init) => {
    if (String(url).includes("oauth/token")) return Response.json({ access_token: "fixture", expires_in: 14400 });
    const body = JSON.parse(String(init?.body));
    return Response.json({ output: [{ data: body.action === "schema" ? schema : { total: 1, resource: "Policy", results: [{ id: 1 }] } }] });
  });
  assert.deepEqual(await client.schema(), schema);
  assert.deepEqual(await client.query({ resource: "Policy", pagination: { limit: 50, offset: 0 } }), { total: 1, rows: [{ id: 1 }] });
});
