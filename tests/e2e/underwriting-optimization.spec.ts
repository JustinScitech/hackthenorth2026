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
  await expect(page.getByText("Good match for review")).toBeVisible();
  await expect(page.getByText("Target renewal matches the supplied carrier guidelines on the available information.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / save PDF" })).toBeVisible();
  await page.evaluate(() => { window.print = () => { (window as Window & { __printCalled?: boolean }).__printCalled = true; }; });
  await page.getByRole("button", { name: "Print / save PDF" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __printCalled?: boolean }).__printCalled)).toBe(true);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download summary" }).click();
  await expect((await download).suggestedFilename()).toMatch(/^underwriting-summary-\d{4}-\d{2}-\d{2}\.md$/);
  await page.getByText("Appetite breakdown and data sources").click();
  await expect(page.getByText("Renewal business is the target.")).toBeVisible();
});
