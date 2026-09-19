import { test, expect } from "./fixtures";

test("triage UI exposes underwriting recommendation and appetite evidence", async ({ authenticatedPage: page }) => {
  await page.goto("/triage");
  await page.route("**/api/triage", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    resource: "Policy", total: 1, evaluated: 1, truncated: false, generatedAt: new Date().toISOString(), guidelineVersion: "Federato HTN 2026 / 2025 sample commercial property appetite", top: 1,
    reasoning: ["Read the discovered appetite fields"], trace: [{ reason: "Fetch all candidates", query: {}, returned: 1 }],
    topSubmissions: [{ id: "1", account: "Target renewal", score: 100, recommendation: "Review for acceptance", explanation: "Renewal business matches the target appetite. Recommendation: review for acceptance.", criteria: [{ factor: "Submission type", status: "target", points: 10, maximum: 10, detail: "Renewal business is the target.", source: "business_type" }] }], ranked: [],
  }) }));
  await page.getByRole("button", { name: "Rank live submissions" }).click();
  await expect(page.getByRole("heading", { name: "Target renewal" })).toBeVisible();
  await expect(page.getByText("Review for acceptance").first()).toBeVisible();
  await page.getByText("Appetite breakdown and data sources").click();
  await expect(page.getByText("Renewal business is the target.")).toBeVisible();
});
