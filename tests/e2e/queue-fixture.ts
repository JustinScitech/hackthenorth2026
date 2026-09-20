import { planQuery } from "../../src/federato/schema";
import { scoreSubmission } from "../../src/federato/scoring";

const fields = {
  id: { type: "number" }, account_name: { type: "string" }, primary_risk_state: { type: "string" }, business_type: { type: "string" }, line_of_business: { type: "string" },
  tiv: { type: "number" }, premium: { type: "number" }, year_built: { type: "number" }, acceptable_construction_percent: { type: "number" }, five_year_loss_value: { type: "number" }, effective_date: { type: "string" }, expiration_date: { type: "string" },
};
const plan = planQuery({ Submission: { type: "object", fields } });
const good = { primary_risk_state: "CA", business_type: "new", line_of_business: "property", tiv: 75_000_000, premium: 85_000, year_built: 2015, acceptable_construction_percent: 75, five_year_loss_value: 0, effective_date: "2026-01-01", expiration_date: "2027-01-01" };

/** A ranked queue the way `POST /api/triage` returns it, scored by the real engine so the page shows real dispositions. */
export function queueFixture(records: { id: number; account: string; patch?: Record<string, unknown> }[]) {
  const ranked = records.map((record) => ({ ...scoreSubmission({ ...good, ...record.patch, id: record.id, account_name: record.account }, plan.mapping), lifecycleStatus: "received", evidenceNote: "Evidence supplemented from uniquely linked Policy 7; insured, line, and effective date match." }));
  return {
    resource: "Submission", total: ranked.length, evaluated: ranked.length, truncated: false, enrichmentComplete: true, generatedAt: new Date().toISOString(),
    guidelineVersion: "Federato HTN 2026 / 2025 sample commercial property appetite", top: 1, mapping: plan.mapping,
    reasoning: ["Selected commercial property records"], trace: [{ reason: "Available queue", query: { resource: "Submission" }, returned: ranked.length, total: ranked.length }],
    topSubmissions: ranked.slice(0, 1), ranked,
  };
}

/** Routes the queue API: the last stored report is empty, and a fresh run returns the fixture (or an error). */
export async function routeQueue(page: import("@playwright/test").Page, fresh: { status: number; body: unknown }) {
  await page.route("**/api/triage", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: '{"report":null}' });
    return route.fulfill({ status: fresh.status, contentType: "application/json", body: JSON.stringify(fresh.body) });
  });
}
