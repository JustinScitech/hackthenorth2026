import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { e2eDatabaseUrl } from "../../scripts/e2e-env";
import { test, expect } from "./fixtures";

// The E2E environment blanks every model key, so these exercise the parser floor and the real rate tables.

test("quote page is public and turns a tenant message into an estimate that refines with answers", async ({ page }) => {
  await page.goto("/quote");
  await expect(page).toHaveURL(/\/quote$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Get an insurance estimate");
  await page.getByLabel("Your message").fill("Hi, I need renters insurance for my apartment in Toronto, I have about $20,000 worth of stuff and no claims.");
  await page.getByRole("button", { name: "Send" }).click();
  const estimate = page.getByRole("region", { name: "Your estimate" });
  await expect(estimate).toContainText("$16–$20 a month");
  await expect(estimate).toContainText("Assumed for now");
  await expect(estimate.getByText("A higher deductible lowers the price", { exact: false })).toBeVisible();
  await estimate.getByLabel("How much would you be comfortable paying yourself on a claim?").selectOption("2500");
  await estimate.getByLabel("Does your home have working smoke detectors?").selectOption("true");
  await estimate.getByRole("button", { name: "Update estimate" }).click();
  await expect(estimate).toContainText("$14–$18 a month");
  await expect(estimate.getByRole("list", { name: "What affects the price" })).toContainText("$2,500 deductible");
  await expect(estimate).toContainText("A licensed advisor confirms the final premium and coverage before anything is bound.");
});

test("quote assistant asks which product when the message does not say, then asks for required auto facts", async ({ page }) => {
  await page.goto("/quote");
  await page.getByLabel("Your message").fill("Can you give me a quote? I live in Ottawa.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Which would you like an estimate for")).toBeVisible();
  await page.getByRole("button", { name: "Car insurance" }).click();
  const estimate = page.getByRole("region", { name: "Your estimate" });
  await expect(estimate).toContainText("A few details before an estimate");
  await expect(estimate.getByLabel("How old is the main driver?")).toBeVisible();
  await expect(estimate.getByLabel("What year is the vehicle?")).toBeVisible();
  await expect(estimate.getByLabel("Which province or territory is the car registered in?")).toBeHidden();
});

test("quote assistant explains the public insurer instead of pricing basic auto coverage in BC", async ({ page }) => {
  await page.goto("/quote");
  await page.getByLabel("Your message").fill("Car insurance in Vancouver, I'm 30 and drive a 2019 Honda Civic to work.");
  await page.getByRole("button", { name: "Send" }).click();
  const estimate = page.getByRole("region", { name: "Your estimate" });
  await expect(estimate).toContainText("public insurer");
  await expect(estimate.getByRole("list", { name: "Next steps" })).toContainText("licensed advisor");
});

test("quote API enforces origin and input without requiring a session", async ({ request }) => {
  expect((await request.post("/api/quote", { data: { text: "hello" } })).status()).toBe(403);
  expect((await request.post("/api/quote", { headers: { origin: "http://localhost:3100" }, data: { answers: { deductible: 999 } } })).status()).toBe(400);
  const response = await request.post("/api/quote", { headers: { origin: "http://localhost:3100" }, data: { product: "tenant", answers: { province: "QC", contentsValue: 25000 } } });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.product).toBe("tenant");
  expect(body.result.status).toBe("estimate");
  expect(body.result.estimate.currency).toBe("CAD");
  expect(body.model).toBeNull();
});

test("case page shows public-source signals as cited findings", async ({ authenticatedPage: page }) => {
  const id = "3f6d0f9e-3f5a-4c1c-9a3f-1d2c3b4a5e6f";
  await page.route(`**/api/cases/${id}`, async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    case: {
      id, insuredName: "Ridgeway Distribution", state: "NJ", tiv: 4300000, status: "review_ready", brief: "1 guideline exception requires underwriter review: year built. The public source raises a point to verify before deciding.",
      facts: { state: { value: "NJ", source: "Intake form", confidence: 1 }, tiv: { value: 4300000, source: "Intake form", confidence: 1 }, yearBuilt: { value: 2005, source: "Broker text via Gemini gemini-3.6-flash", confidence: 0.5 }, losses: { value: 1, source: "Intake form", confidence: 1 } },
      findings: [
        { id: "construction", label: "Year built", result: "pass", detail: "Meets the demo construction-year rule.", source: "Broker text via Gemini gemini-3.6-flash" },
        { id: "evidence_yearBuilt", label: "Public year built", result: "refer", detail: "The public record lists 1965, but the submission says 2005. Resolve the discrepancy before review. \"Year Built: 1965.\"", source: "Public source: assessor.example.gov (unverified)" },
        { id: "evidence_floodZone", label: "Public flood zone", result: "refer", detail: "FEMA zone AE is a Special Flood Hazard Area; flood exposure needs underwriter attention. \"FEMA Flood Zone: AE\"", source: "Public source: assessor.example.gov (unverified)" },
      ],
      publicEvidence: { url: "https://assessor.example.gov/parcel/0421-00017", title: "Property Record Card", excerpt: "Year Built: 1965. FEMA Flood Zone: AE.", signals: [{ kind: "yearBuilt", value: 1965, quote: "Year Built: 1965." }, { kind: "floodZone", value: "AE", quote: "FEMA Flood Zone: AE" }] },
      createdAt: new Date().toISOString(),
    },
    audit: [
      { id: "1", eventType: "openai_model_completed", detail: { model: "gpt-5-mini", durationMs: 1800 }, createdAt: new Date().toISOString() },
      { id: "2", eventType: "public_research_completed", detail: { url: "https://assessor.example.gov/parcel/0421-00017", signals: ["yearBuilt", "floodZone"] }, createdAt: new Date().toISOString() },
    ],
    jobStatus: "WAITING", voiceAvailable: false,
  }) }));
  await page.goto(`/cases/${id}`);
  const checks = page.getByRole("region", { name: /guideline checks|appetite checks/ });
  await expect(checks).toContainText("Public year built");
  await expect(checks).toContainText("lists 1965, but the submission says 2005");
  await expect(checks).toContainText("source: Public source: assessor.example.gov (unverified)");
  await expect(checks).toContainText("Special Flood Hazard Area");
  await expect(page.getByText("50% confidence")).toBeVisible();
  const trace = page.locator(".analysis-trace");
  await expect(trace).toContainText("2 signals: yearBuilt, floodZone");
  await expect(page.getByRole("heading", { name: "Public-source evidence" })).toBeVisible();
});

test("a public quote conversation appears in the workspace quotes list", async ({ authenticatedPage: page, request }) => {
  const quoteId = randomUUID();
  const origin = { origin: "http://localhost:3100" };
  const first = await request.post("/api/quote", { headers: origin, data: { quoteId, text: "Renters insurance for a condo in Halifax, my belongings are worth about $30,000, no claims." } });
  expect(first.status()).toBe(200);
  expect((await first.json()).quoteId).toBe(quoteId);
  const second = await request.post("/api/quote", { headers: origin, data: { quoteId, product: "tenant", answers: { province: "NS", contentsValue: 30000, priorClaims: 0, deductible: 2500 } } });
  expect((await second.json()).result.status).toBe("estimate");

  await page.goto("/quotes");
  await expect(page.getByRole("heading", { name: "Quote requests" })).toBeVisible();
  const row = page.getByRole("article", { name: `Quote ${quoteId.slice(0, 8)}` });
  await expect(row).toContainText("Tenant insurance · NS");
  await expect(row).toContainText("Estimate ready");
  await expect(row).not.toContainText(/parser only|gemini|read with|turns/i);
  await expect(row).toContainText("CAD / month · demo estimate");
  await row.getByText("View request details").click();
  await expect(row.getByRole("definition").filter({ hasText: "$2,500" })).toBeVisible();
  await expect(row).not.toContainText("Halifax");

  const list = await page.request.get("/api/quotes");
  expect(list.status()).toBe(200);
  const saved = (await list.json()).quotes.find((quote: { id: string }) => quote.id === quoteId);
  expect(saved).toMatchObject({ product: "tenant", status: "estimate", province: "NS", turns: 2, heard: { contentsValue: 30000, deductible: 2500 } });
  expect(JSON.stringify(saved)).not.toContain("Halifax");

  await page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Quotes" }).click();
  await expect(page).toHaveURL(/\/quotes$/);

  const db = new Client({ connectionString: e2eDatabaseUrl() });
  await db.connect();
  try { await db.query("DELETE FROM quotes WHERE id = $1", [quoteId]); } finally { await db.end(); }
});

test("quote workspace filters requests and keeps technical details out of the review", async ({ authenticatedPage: page }) => {
  const base = { province: "ON", estimate: null, heard: {}, openQuestions: 0, referral: null, model: "gemini-3.6-flash", turns: 2, createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z" };
  await page.route("**/api/quotes", (route) => route.fulfill({ json: { quotes: [
    { ...base, id: "estimate-1", product: "auto", status: "estimate", heard: { annualKm: 15000, vehicleYear: 2020, winterTires: false }, estimate: { monthlyLow: 118, monthlyHigh: 144 } },
    { ...base, id: "referral-1", product: "tenant", status: "refer", referral: "This request needs an advisor review." },
    { ...base, id: "incomplete-1", product: null, status: "choosing" },
  ] } }));
  await page.goto("/quotes");
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByRole("main")).not.toContainText(/gemini|parser only|read with/i);
  await page.getByRole("button", { name: "Advisor review" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByText("View request details").click();
  await expect(page.getByRole("article")).toContainText("no referral has been sent");
  await page.getByRole("button", { name: "Incomplete" }).click();
  await expect(page.getByRole("article")).toContainText("Product not selected");
  await page.getByRole("button", { name: "Estimates ready" }).click();
  await page.getByText("View request details").click();
  await expect(page.getByRole("definition").filter({ hasText: "15,000" })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "2020" })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "No" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("landing page and site chrome lead to the public assistant", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Get an estimate" }).click();
  await expect(page).toHaveURL(/\/quote$/);
  await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Get an estimate" }).click();
  await expect(page).toHaveURL(/\/quote$/);
  expect((await page.request.get("/api/quotes")).status()).toBe(401);
});
