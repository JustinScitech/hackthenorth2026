import { test, expect } from "./fixtures";

test("triage UI exposes underwriting recommendation and appetite evidence", async ({ authenticatedPage: page }) => {
  await page.goto("/triage");
  await page.route("**/api/triage", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    resource: "Policy", total: 1, evaluated: 1, truncated: false, generatedAt: new Date().toISOString(), guidelineVersion: "Federato HTN 2026 / 2025 sample commercial property appetite", top: 1,
    reasoning: ["Read the discovered appetite fields"], trace: [{ reason: "Fetch all candidates", query: {}, returned: 1 }],
    topSubmissions: [{ id: "1", account: "New property", score: 94, rawScore: 94, missingData: [], recommendation: "Review for acceptance", explanation: "New business is acceptable. Recommendation: review for acceptance.", criteria: [{ factor: "Submission type", status: "acceptable", points: 8, maximum: 10, detail: "New business is acceptable.", source: "business_type" }] }], ranked: [],
  }) }));
  await page.getByRole("button", { name: "Rank live records" }).click();
  await expect(page.getByRole("heading", { name: "New property" })).toBeVisible();
  await expect(page.getByText("Good match for review")).toBeVisible();
  await expect(page.getByText("New property matches the supplied carrier guidelines on the available information.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / save PDF" })).toBeVisible();
  await page.evaluate(() => { window.print = () => { (window as Window & { __printCalled?: boolean }).__printCalled = true; }; });
  await page.getByRole("button", { name: "Print / save PDF" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __printCalled?: boolean }).__printCalled)).toBe(true);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download slides" }).click();
  await expect((await download).suggestedFilename()).toMatch(/^federato-triage-top-\d{4}-\d{2}-\d{2}\.pptx$/);
  await page.getByText("Appetite breakdown and data sources").click();
  await expect(page.getByRole("cell", { name: "New business is acceptable." })).toBeVisible();
});

test("real cases share carrier scoring, distinguish renewals, and rank the queue", async ({ authenticatedPage: page }) => {
  test.setTimeout(90_000);
  const results: { id: string; score: number; rawScore: number; business: string }[] = [];
  for (const business of ["new", "renewal"]) {
    await page.goto("/cases/new");
    await page.locator(".sample-select-trigger").click();
    await page.getByRole("menuitemradio", { name: /California office/ }).click();
    await page.getByRole("combobox", { name: /Business type/ }).selectOption(business);
    await page.getByRole("button", { name: "Start analysis" }).click();
    await expect(page).toHaveURL(/\/cases\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Underwriter decision" })).toBeVisible({ timeout: 40_000 });
    await expect(page.getByRole("heading", { name: "Carrier appetite checks" })).toBeVisible();
    const id = page.url().split("/").at(-1)!;
    const record = (await (await page.request.get(`/api/cases/${id}`)).json()).case;
    expect(record.appetiteResult.criteria).toHaveLength(8);
    expect(record.appetiteResult.missingData).toEqual([]);
    expect(record.appetiteResult.score).toBe(business === "new" ? 94 : 49);
    expect(record.appetiteResult.rawScore).toBe(business === "new" ? 94 : 86);
    results.push({ id, score: record.appetiteResult.score, rawScore: record.appetiteResult.rawScore, business });
  }
  await page.goto("/cases");
  const links = await page.locator(".case-row").evaluateAll((elements) => elements.map((element) => element.getAttribute("href")));
  expect(links.indexOf(`/cases/${results[0].id}`)).toBeLessThan(links.indexOf(`/cases/${results[1].id}`));
});
