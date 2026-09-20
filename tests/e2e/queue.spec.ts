import { expect, test } from "./fixtures";
import { queueFixture } from "./queue-fixture";

/**
 * The queue against the real backend: stored reports come back from PostgreSQL, the page and the
 * overview open on them without a fresh run, the API stays behind sign-in, and, when the suite is
 * started with E2E_LIVE_FEDERATO=1, a real Federato rank runs end to end and is stored.
 */
const dispositions = ["Target", "Acceptable", "Needs information", "Outside appetite"];

test("a stored ranked queue opens on the queue page and the overview without a fresh run", async ({ authenticatedPage: page, seedTriageReport }) => {
  const report = queueFixture([
    { id: 7101, account: "Stored Target Office" },
    { id: 7102, account: "Stored Open Warehouse", patch: { premium: null } },
    { id: 7103, account: "Stored Renewal Plant", patch: { business_type: "renewal" } },
    { id: 7104, account: "Stored Fleet Auto", patch: { line_of_business: "auto" } },
  ]);
  await seedTriageReport(report);

  const stored = await page.request.get("/api/triage");
  expect(stored.status()).toBe(200);
  const body = await stored.json();
  expect(body.report.generatedAt).toBe(report.generatedAt);
  expect(body.report.ranked.map((item: { id: string }) => item.id)).toEqual(["7101", "7102", "7103", "7104"]);

  await page.goto("/triage");
  await expect(page.getByRole("button", { name: "Rank again" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stored Target Office" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Property lines/ })).toContainText("3");
  await expect(page.getByRole("button", { name: /^Target/ })).toContainText("1");
  await expect(page.getByRole("button", { name: /Needs information/ })).toContainText("1");
  await expect(page.getByRole("button", { name: /Outside appetite/ })).toContainText("1");
  await expect(page.getByRole("heading", { name: "Stored Fleet Auto" })).toHaveCount(0);
  await page.getByRole("button", { name: /Outside appetite/ }).click();
  await expect(page.getByRole("heading", { name: "Stored Renewal Plant" })).toBeVisible();
  await expect(page.getByText(/renewal business, which the guideline lists as unacceptable/)).toBeVisible();

  await page.goto("/overview");
  const panel = page.getByRole("region", { name: "Federato queue" });
  await expect(panel).toContainText("Property submissions");
  await expect(panel.locator(".stat", { hasText: "Property submissions" })).toContainText("3");
  await expect(panel.locator(".stat", { hasText: "Needs information" })).toContainText("1");
  await expect(panel.locator(".stat", { hasText: "Outside appetite" })).toContainText("1");
});

test("the queue API stays behind sign-in and the page explains an empty store", async ({ authenticatedPage: page, request }) => {
  expect((await request.get("/api/triage")).status()).toBe(401);
  expect((await request.post("/api/triage", { headers: { origin: "http://localhost:3100" } })).status()).toBe(401);
  await page.route("**/api/triage", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"report":null}' }));
  await page.goto("/triage");
  await expect(page.getByText("The queue has yet to be ranked.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Rank the live queue" }).first()).toBeVisible();
});

test("a live Federato rank reads every submission, assigns dispositions, and is stored", async ({ authenticatedPage: page }) => {
  test.skip(process.env.E2E_LIVE_FEDERATO !== "1", "Set E2E_LIVE_FEDERATO=1 with Federato credentials in .env to run the live rank");
  test.setTimeout(180_000);
  const response = await page.request.post("/api/triage", { headers: { origin: "http://localhost:3100" }, timeout: 150_000 });
  expect(response.status(), await response.text()).toBe(200);
  const report = await response.json();
  expect(report.evaluated).toBeGreaterThan(0);
  expect(report.evaluated).toBe(report.ranked.length);
  expect(report.truncated).toBe(false);
  for (const item of report.ranked) {
    expect(dispositions).toContain(item.disposition);
    expect(item.criteria).toHaveLength(8);
    expect(item.facts).toBeTruthy();
  }
  // Verified matches, then open answers, then exceptions: the tier never goes back up.
  const tier = (item: { disposition: string }) => item.disposition === "Outside appetite" ? 2 : item.disposition === "Needs information" ? 1 : 0;
  for (let index = 1; index < report.ranked.length; index++) expect(tier(report.ranked[index])).toBeGreaterThanOrEqual(tier(report.ranked[index - 1]));
  const stored = await (await page.request.get("/api/triage")).json();
  expect(stored.report.generatedAt).toBe(report.generatedAt);
  await page.goto("/triage");
  await expect(page.getByRole("button", { name: "Rank again" })).toBeVisible();
  await expect(page.locator(".queue-row").first()).toBeVisible();
});
