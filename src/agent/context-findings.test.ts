import assert from "node:assert/strict";
import { test } from "node:test";
import { applyContextAdjustment, assessPropertyContext, CONTEXT_ADJUSTMENT_RANGE } from "./context-findings";
import type { PropertyContext } from "./property-context";
import type { SourceResult } from "./context-sources";
import type { RankedSubmission } from "../federato/scoring";

const geocoded = { latitude: 39.74, longitude: -104.99, matchedAddress: "1600 BROADWAY, DENVER, CO, 80202", stateFips: "08", countyFips: "031", countyName: "Denver County", tract: "002604", tractLandAreaSqMi: 0.09 };
const ok = (id: SourceResult["id"], data: Record<string, unknown>, summary = `${id} summary`): SourceResult => ({ id, label: `${id} label`, status: "ok", url: `https://example.gov/${id}`, summary, data, ms: 10 });
const context = (sources: SourceResult[]): PropertyContext => ({ address: "1600 Broadway, Denver, CO 80202", geocoded, geocodeUrl: "https://geocoding.geo.census.gov/", sources, gatheredAt: "2026-09-20T00:00:00.000Z" });
const ranked = (overrides: Partial<RankedSubmission> = {}): RankedSubmission => ({ id: "case", account: "Front Range Fabrication", score: 100, rawScore: 100, recommendation: "Review for acceptance", explanation: "Score 100/100.", criteria: [], missingData: [], ...overrides });

test("a Special Flood Hazard Area is a referral that takes ten points, with the FEMA record cited", () => {
  const assessment = assessPropertyContext(context([ok("flood", { zone: "AE", subtype: null, specialFloodHazardArea: true }, "FEMA flood zone AE, a Special Flood Hazard Area.")]));
  const flood = assessment.findings.find((finding) => finding.id === "context_flood");
  assert.equal(flood?.result, "refer");
  assert.equal(flood?.source, "https://example.gov/flood");
  assert.deepEqual(assessment.adjustments.map((item) => item.points), [-10]);
  assert.equal(assessment.adjustment, -10);
  assert.match(assessment.note, /flood zone -10/);
});

test("good fire protection lifts priority a little and clean surroundings pass without points", () => {
  const assessment = assessPropertyContext(context([ok("surroundings", { nearestFireStationMi: 0.5, fireStationsWithin5Mi: 25, hydrantsWithin300m: 26, fuelStationsWithin150m: 0, industrialWithin300m: 0, railWithin100m: 0, coastlineWithin5km: false, building: { type: "commercial", levels: 26, heightFt: null, name: "Colorado State Bank Building" } })]));
  assert.equal(assessment.findings.find((finding) => finding.id === "context_fire_protection")?.result, "pass");
  assert.equal(assessment.findings.find((finding) => finding.id === "context_neighbours")?.result, "pass");
  assert.match(assessment.findings.find((finding) => finding.id === "context_building")?.detail ?? "", /26 levels/);
  assert.equal(assessment.adjustment, 4);
});

test("stacked hazards are clamped to the stated range and every point is listed", () => {
  const assessment = assessPropertyContext(context([
    ok("flood", { zone: "VE", subtype: null, specialFloodHazardArea: true }),
    ok("wildfire", { firesWithin10km: 4, firesWithin2km: 1, acresWithin10km: 150_000, latestYear: 2018, latestName: "Camp" }),
    ok("seismic", { quakesM45Within100km: 80, since: "1975", largestMagnitude: 6.9, largestPlace: "Loma Prieta" }),
    ok("weather", { years: 10, maxGustMph: 95, gustDaysOver60: 12, gustDaysOver75: 3, heavyRainDays: 25, maxDailyRainIn: 6, hardFreezeDays: 0, maxDailySnowIn: 0 }),
    ok("surroundings", { nearestFireStationMi: null, fireStationsWithin5Mi: 0, hydrantsWithin300m: 0, fuelStationsWithin150m: 1, industrialWithin300m: 1, railWithin100m: 1, coastlineWithin5km: true, building: null }),
    ok("epa", { facilitiesWithinHalfMile: 12, withViolations: 2, names: ["A", "B"] }),
    ok("disasters", { declarationsSince: "2006", total: 31, byType: { Hurricane: 20 }, latest: null }),
  ]));
  const total = assessment.adjustments.reduce((sum, item) => sum + item.points, 0);
  assert.ok(total < CONTEXT_ADJUSTMENT_RANGE.min, `raw total ${total} should exceed the floor before clamping`);
  assert.equal(assessment.adjustment, CONTEXT_ADJUSTMENT_RANGE.min);
  assert.ok(assessment.findings.filter((finding) => finding.result === "refer").length >= 6);
  assert.ok(assessment.adjustments.every((item) => item.source.startsWith("https://example.gov/")));
});

test("applying the assessment moves the priority score, keeps the carrier cap, and leaves the raw match alone", () => {
  const assessment = assessPropertyContext(context([ok("flood", { zone: "A", subtype: null, specialFloodHazardArea: true })]));
  const clean = applyContextAdjustment(ranked(), assessment);
  assert.equal(clean.baseScore, 100);
  assert.equal(clean.score, 90);
  assert.equal(clean.rawScore, 100);
  assert.match(clean.explanation, /Flood zone -10; priority 100 → 90/);
  const capped = applyContextAdjustment(ranked({ score: 49, rawScore: 85, criteria: [{ concept: "state", factor: "Primary risk state", status: "outside", points: 0, maximum: 15, detail: "", source: "" }] }), assessment);
  assert.equal(capped.score, 39);
  const lifted = applyContextAdjustment(ranked({ score: 49, rawScore: 85, criteria: [{ concept: "state", factor: "Primary risk state", status: "outside", points: 0, maximum: 15, detail: "", source: "" }] }), assessPropertyContext(context([ok("surroundings", { nearestFireStationMi: 0.3, fireStationsWithin5Mi: 3, hydrantsWithin300m: 2, fuelStationsWithin150m: 0, industrialWithin300m: 0, railWithin100m: 0, coastlineWithin5km: false, building: null })])));
  assert.equal(lifted.score, 49, "protection can never lift a record above the carrier cap");
});

test("datasets that did not answer become one unknown finding and no points", () => {
  const assessment = assessPropertyContext(context([
    ok("elevation", { elevationFt: 5243 }),
    { id: "flood", label: "Flood zone (FEMA NFHL)", status: "unavailable", url: "", summary: "Unavailable: fetch failed.", data: {}, ms: 0 },
  ]));
  assert.equal(assessment.adjustments.length, 0);
  const unknown = assessment.findings.find((finding) => finding.result === "unknown");
  assert.match(unknown?.detail ?? "", /Flood zone \(FEMA NFHL\)/);
  assert.equal(applyContextAdjustment(ranked(), assessment).score, 100);
});
