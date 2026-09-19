import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("public pages are accessible and protected pages require sign-in", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Underwriting review");
  await page.getByRole("link", { name: "Read the docs" }).click();
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("API reference");
  await page.goto("/cases");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("button", { name: /Google/ })).toBeDisabled();

  for (const path of ["/api/cases", `/api/cases/${randomUUID()}`, "/api/metrics"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
  }
  for (const path of ["/api/cases", `/api/cases/${randomUUID()}/actions`, "/api/triage"]) {
    const response = await request.post(path, { headers: { origin: "http://localhost:3100" }, data: {} });
    expect(response.status()).toBe(401);
  }
});

test("overview, case list, search, and navigation use real session and case data", async ({ authenticatedPage: page, seedCase }) => {
  const name = `E2E Meridian ${randomUUID().slice(0, 8)}`;
  const id = await seedCase({ insuredName: name, status: "waiting_for_broker" });
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Agent quality" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Agent quality" }).getByText("Past 30 days", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: /Cases/ }).first()).toBeVisible();
  await page.goto("/cases");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await page.getByRole("searchbox", { name: "Filter cases" }).fill(name);
  await expect(page.locator(".case-row")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Filter cases" }).fill("no-such-insured-e2e");
  await expect(page.getByText("No cases match that filter.")).toBeVisible();
  await page.getByRole("searchbox", { name: "Filter cases" }).fill(name);
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(new RegExp(`/cases/${id}$`));
  await expect(page.getByRole("heading", { name })).toBeVisible();
});

test("overview and metrics API show the latest persisted eval", async ({ authenticatedPage: page, seedEvalRun }) => {
  await seedEvalRun(3, 4);
  await page.goto("/overview");
  const quality = page.getByRole("region", { name: "Agent quality" });
  await expect(quality.getByText("3/4")).toBeVisible();
  await expect(quality.getByText("fixture-model", { exact: false })).toBeVisible();
  const response = await page.request.get("/api/metrics");
  expect(response.status()).toBe(200);
  expect((await response.json()).latestEval).toMatchObject({ passed: 3, total: 4, model: "fixture-model" });
});

test("sample picker fills intake, supports keyboard selection, and sends the expected submission", async ({ authenticatedPage: page }) => {
  const id = randomUUID();
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/cases", async (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id }) });
    } else await route.continue();
  });
  await page.route(`**/api/cases/${id}`, async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    case: { id, insuredName: "Garden State Distribution", state: "NJ", tiv: 6800000, status: "received", brief: null, facts: null, findings: null, publicEvidence: null, createdAt: new Date().toISOString() },
    audit: [], workflowStatus: "RUNNING", voiceAvailable: false,
  }) }));
  await page.goto("/cases/new");
  await page.getByRole("button", { name: /Custom submission/ }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitemradio", { name: /New Jersey warehouse/ }).click();
  await expect(page.getByLabel("Insured name")).toHaveValue("Garden State Distribution");
  await expect(page.getByRole("spinbutton", { name: "Total insured value" })).toHaveValue("6800000");
  await page.getByRole("button", { name: /New Jersey warehouse/ }).press("ArrowDown");
  await expect(page.getByRole("menuitemradio", { name: /New Jersey warehouse/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitemradio", { name: /Pennsylvania retail/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Insured name")).toHaveValue("Keystone Market Group");
  await page.getByRole("button", { name: /Pennsylvania retail/ }).click();
  await page.getByRole("menuitemradio", { name: "Custom submission" }).click();
  await expect(page.getByLabel("Insured name")).toHaveValue("");
  await page.getByRole("button", { name: /Custom submission/ }).click();
  await page.getByRole("menuitemradio", { name: /New Jersey warehouse/ }).click();
  await page.getByRole("button", { name: "Start analysis" }).click();
  await expect(page).toHaveURL(new RegExp(`/cases/${id}$`));
  expect(submitted).toMatchObject({ insuredName: "Garden State Distribution", state: "NJ", tiv: 6800000, yearBuilt: 1974, losses: 1, publicSourceUrl: null });
});

test("all sample submissions populate fields and editing returns to custom mode", async ({ authenticatedPage: page }) => {
  await page.goto("/cases/new");
  for (const sample of [
    { option: /New York office/, name: "Hudson Square Offices", state: "NY", tiv: "2400000", year: "2012", losses: "0" },
    { option: /Colorado fabrication/, name: "Front Range Fabrication", state: "CO", tiv: "3200000", year: "2008", losses: "0" },
    { option: /New Jersey warehouse/, name: "Garden State Distribution", state: "NJ", tiv: "6800000", year: "1974", losses: "1" },
    { option: /Pennsylvania retail/, name: "Keystone Market Group", state: "PA", tiv: "4100000", year: "1999", losses: "4" },
    { option: /New York restaurant/, name: "Canal Street Kitchen", state: "NY", tiv: "1750000", year: "", losses: "" },
  ]) {
    await page.locator(".sample-select-trigger").click();
    await page.getByRole("menuitemradio", { name: sample.option }).click();
    await expect(page.getByLabel("Insured name")).toHaveValue(sample.name);
    await expect(page.getByRole("textbox", { name: "State" })).toHaveValue(sample.state);
    await expect(page.getByRole("spinbutton", { name: "Total insured value" })).toHaveValue(sample.tiv);
    await expect(page.getByRole("spinbutton", { name: /Year built/ })).toHaveValue(sample.year);
    await expect(page.getByRole("spinbutton", { name: /Loss count/ })).toHaveValue(sample.losses);
  }
  await page.getByLabel("Insured name").fill("Updated Kitchen");
  await expect(page.locator(".sample-select-trigger")).toContainText("Custom submission");
});

test("intake shows a failed create request without losing the submission", async ({ authenticatedPage: page }) => {
  await page.route("**/api/cases", async (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Worker unavailable"}' }));
  await page.goto("/cases/new?sample=1");
  await page.getByRole("button", { name: "Start analysis" }).click();
  await expect(page.locator(".alert[role=alert]")).toContainText("Worker unavailable");
  await expect(page.getByLabel("Insured name")).toHaveValue("Front Range Fabrication");
  await expect(page.getByRole("button", { name: "Start analysis" })).toBeEnabled();
});

test("case trace shows live progress and broker and underwriter actions", async ({ authenticatedPage: page }) => {
  const id = randomUUID();
  let status = "extracting";
  const actions: Record<string, unknown>[] = [];
  await page.route(`**/api/cases/${id}`, async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    case: { id, insuredName: "Trace Test Office", state: "NY", tiv: 2400000, status, brief: status === "extracting" ? null : "Review completed.", question: "What year was it built?", decision: "Approved after review.", facts: null, findings: null, publicEvidence: null, createdAt: new Date().toISOString() },
    audit: [{ id: "1", eventType: "gemini_model_started", detail: { model: "gemini-3.8-flash" }, createdAt: new Date().toISOString() }],
    workflowStatus: "RUNNING", voiceAvailable: false,
  }) }));
  await page.route(`**/api/cases/${id}/actions`, async (route) => {
    const body = route.request().postDataJSON();
    actions.push(body);
    status = body.kind === "broker_response" ? "review_ready" : "approved";
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await page.goto(`/cases/${id}`);
  await expect(page.getByRole("status")).toContainText("Extracting with gemini-3.8-flash");
  await expect(page.getByRole("region", { name: "Activity trace" })).toContainText("Gemini model started");
  status = "waiting_for_broker";
  await page.reload();
  await page.getByLabel("Broker response").fill("Built in 2012 and fully sprinklered.");
  await page.getByRole("button", { name: "Add response and resume" }).click();
  await expect(page.getByRole("heading", { name: "Underwriter decision" })).toBeVisible();
  await page.getByLabel("Review rationale").fill("Within demo appetite after reviewing evidence.");
  await page.getByRole("button", { name: "Approve review" }).click();
  await expect(page.getByRole("heading", { name: "Decision rationale" })).toBeVisible();
  expect(actions.map((action) => action.kind)).toEqual(["broker_response", "approve"]);
  expect(actions.every((action) => typeof action.id === "string")).toBe(true);
});

test("underwriter can decline with a recorded rationale", async ({ authenticatedPage: page }) => {
  const id = randomUUID();
  let action: Record<string, unknown> | undefined;
  await page.route(`**/api/cases/${id}`, async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    case: { id, insuredName: "Referral Warehouse", state: "NJ", tiv: 6800000, status: action ? "declined" : "review_ready", brief: "Referral required.", decision: "Value outside demo appetite.", facts: null, findings: [{ id: "tiv", label: "Total insured value", result: "refer", detail: "Above the demo limit.", source: "Intake form" }], createdAt: new Date().toISOString() },
    audit: [], workflowStatus: "RUNNING", voiceAvailable: false,
  }) }));
  await page.route(`**/api/cases/${id}/actions`, async (route) => {
    action = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await page.goto(`/cases/${id}`);
  await expect(page.getByRole("heading", { name: "Demo guideline checks" })).toBeVisible();
  await page.getByLabel("Review rationale").fill("Value outside demo appetite.");
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByRole("heading", { name: "Decision rationale" })).toBeVisible();
  expect(action).toMatchObject({ kind: "decline", reason: "Value outside demo appetite." });
});

test("triage presents ranked results, query reasoning, and errors", async ({ authenticatedPage: page }) => {
  await page.goto("/triage");
  await page.route("**/api/triage", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    resource: "submissions", total: 2, evaluated: 2, truncated: false, generatedAt: new Date().toISOString(), guidelineVersion: "2025",
    top: 1, reasoning: ["Selected commercial property records"], trace: [{ reason: "Available queue", query: {}, returned: 2 }],
    topSubmissions: [{ id: "a", account: "Top Office", score: 92, recommendation: "Review first", explanation: "Strong appetite match", criteria: [{ factor: "Territory", status: "target", points: 10, maximum: 10, detail: "Eligible", source: "State" }] }],
    ranked: [{ id: "a", account: "Top Office", score: 92, recommendation: "Review first", explanation: "Strong appetite match", criteria: [] }, { id: "b", account: "Second Warehouse", score: 70, recommendation: "Review", explanation: "Needs review", criteria: [] }],
  }) }));
  await page.getByRole("button", { name: "Rank live submissions" }).click();
  await expect(page.getByRole("heading", { name: "Top Office" })).toBeVisible();
  await page.getByText("Query reasoning and scoring method").click();
  await expect(page.getByText("Selected commercial property records")).toBeVisible();
  await page.getByRole("button", { name: "Show all results" }).click();
  await expect(page.getByRole("heading", { name: "Second Warehouse" })).toBeVisible();
  await page.route("**/api/triage", async (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Federato unavailable"}' }));
  await page.getByRole("button", { name: "Rank live submissions" }).click();
  await expect(page.locator(".triage-heading ~ [aria-live] [role=alert]")).toContainText("Federato unavailable");
});

test("settings theme persists and mobile navigation works", async ({ authenticatedPage: page }) => {
  await page.goto("/settings");
  await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Light" }).click();
  await expect(page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Cases" }).click();
  await expect(page).toHaveURL(/\/cases$/);
  await expect(page.locator(".app-frame")).toHaveAttribute("data-nav-open", "false");
});

test("authenticated APIs enforce origin, input, and case state", async ({ authenticatedPage: page, seedCase }) => {
  const id = await seedCase({ status: "review_ready" });
  await page.goto("/overview");
  const api = page.request;
  const cases = await api.get("/api/cases");
  expect(cases.status()).toBe(200);
  expect((await cases.json()).cases.some((record: { id: string }) => record.id === id)).toBe(true);
  const metrics = await api.get("/api/metrics");
  expect(metrics.status()).toBe(200);
  expect((await metrics.json()).submissions).toBeGreaterThanOrEqual(1);
  expect((await api.get("/api/cases/not-a-uuid")).status()).toBe(400);
  expect((await api.get(`/api/cases/${randomUUID()}`)).status()).toBe(404);
  expect((await api.post("/api/cases", { data: {} })).status()).toBe(403);
  expect((await api.post("/api/cases", { headers: { origin: "http://localhost:3100" }, data: {} })).status()).toBe(400);
  expect((await api.post("/api/cases", { headers: { origin: "http://localhost:3100" }, data: {
    insuredName: "Test Office", state: "NY", tiv: 1000000, yearBuilt: 2010, losses: 0,
    brokerNotes: "Built in 2010 with no losses.", publicSourceUrl: "https://localhost/private",
  } })).status()).toBe(400);
  expect((await api.post(`/api/cases/${id}/actions`, { headers: { origin: "http://localhost:3100" }, data: { id: randomUUID(), kind: "approve", reason: "x" } })).status()).toBe(400);
  expect((await api.post(`/api/cases/${id}/actions`, { headers: { origin: "http://localhost:3100" }, data: { id: randomUUID(), kind: "broker_response", response: "Updated property data" } })).status()).toBe(409);
  expect((await api.post("/api/triage", { headers: { origin: "https://evil.example" } })).status()).toBe(403);
});

test("sign-out revokes the authenticated session", async ({ authenticatedPage: page }) => {
  await page.goto("/overview");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/cases");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("real Temporal workflow pauses for broker, resumes, and records a decision", async ({ authenticatedPage: page }) => {
  test.setTimeout(90_000);
  await page.goto("/cases/new");
  await page.locator(".sample-select-trigger").click();
  await page.getByRole("menuitemradio", { name: /New York restaurant/ }).click();
  await page.getByRole("button", { name: "Start analysis" }).click();
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Broker information needed" })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole("region", { name: "Activity trace" })).toContainText("Facts extracted");
  await expect(page.getByRole("region", { name: "Activity trace" })).toContainText("Parser only; no model configured");
  await page.getByLabel("Broker response").fill("The restaurant building was constructed in 2001. No losses in the past three years.");
  await page.getByRole("button", { name: "Add response and resume" }).click();
  await expect(page.getByRole("heading", { name: "Underwriter decision" })).toBeVisible({ timeout: 40_000 });
  await page.getByLabel("Review rationale").fill("Reviewed the completed submission and demo guideline checks.");
  await page.getByRole("button", { name: "Approve review" }).click();
  await expect(page.getByRole("heading", { name: "Decision rationale" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Activity trace" })).toContainText("Review approved");
});
