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
  await expect(page.getByRole("region", { name: "Queue review status" })).toContainText("Ready for review does not mean approved");
  await page.getByText("Review checklist · 0 exceptions · 0 evidence gaps").click();
  await expect(page.getByText("No unresolved appetite checks.", { exact: false })).toBeVisible();
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

test("blank intake appetite fields retain broker evidence through the real worker", async ({ authenticatedPage: page }) => {
  const response = await page.request.post("/api/cases", {
    headers: { origin: "http://localhost:3100" },
    data: {
      insuredName: "Broker Evidence Regression", state: "CA", tiv: 75000000, yearBuilt: 2015, losses: 0,
      appetite: { premium: null, business: null, line: null, constructionPercent: null, lossValue: null, lossHistoryComplete: true },
      brokerNotes: "Business type: new\nLine of business: property\nPremium: 85000\nEligible construction percent: 75\nFive-year loss value: 0\nEffective date: 2026-01-01\nExpiration date: 2027-01-01",
      publicSourceUrl: null,
    },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  await expect.poll(async () => (await (await page.request.get(`/api/cases/${id}`)).json()).case.status, { timeout: 40000 }).toBe("review_ready");
  const record = (await (await page.request.get(`/api/cases/${id}`)).json()).case;
  expect(record.facts.appetite.value.premium).toBe(85000);
  expect(record.appetiteResult.missingData).toEqual([]);
  expect(record.appetiteResult.score).toBe(94);
});

test("real cases share carrier scoring, distinguish renewals, and rank the queue", async ({ authenticatedPage: page }, testInfo) => {
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
    expect(record.appetiteResult.baseScore).toBe(business === "new" ? 94 : 49);
    expect(record.appetiteResult.score).toBeGreaterThanOrEqual(0);
    expect(record.appetiteResult.score).toBeLessThanOrEqual(100);
    expect(record.appetiteResult.rawScore).toBe(business === "new" ? 94 : 86);
    if (business === "new") {
      const recommendation = page.getByRole("region", { name: "Appetite recommendation" });
      expect(await recommendation.evaluate((element) => parseFloat(getComputedStyle(element).paddingLeft))).toBeGreaterThanOrEqual(16);
      const decision = await page.getByRole("region", { name: "Underwriter decision" }).boundingBox();
      const chat = await page.getByRole("region", { name: "Ask the agent" }).boundingBox();
      expect(chat!.y - (decision!.y + decision!.height)).toBeGreaterThanOrEqual(24);
      await page.screenshot({ path: testInfo.outputPath("case-desktop.png"), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("case-mobile.png"), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    results.push({ id, score: record.appetiteResult.score, rawScore: record.appetiteResult.rawScore, business });
  }
  await page.goto("/cases");
  await expect(page.locator(`.case-row[href="/cases/${results[0].id}"]`)).toBeVisible();
  await expect(page.locator(`.case-row[href="/cases/${results[1].id}"]`)).toBeVisible();
  const links = await page.locator(".case-row").evaluateAll((elements) => elements.map((element) => element.getAttribute("href")));
  expect(links.indexOf(`/cases/${results[0].id}`)).toBeLessThan(links.indexOf(`/cases/${results[1].id}`));
});
