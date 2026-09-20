import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("case report downloads as a PDF for an authenticated reviewer", async ({ authenticatedPage: page, seedCase }) => {
  const id = await seedCase({ insuredName: "PDF Export Fabrication" });
  await page.goto(`/cases/${id}`);
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeVisible();

  const response = await page.request.post(`/api/cases/${id}/pdf`, {
    headers: { origin: "http://localhost:3100" },
    data: { conversation: [{ role: "you", text: "What is the main concern?" }, { role: "agent", text: "Confirm the year built." }] },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect(response.headers()["content-disposition"]).toContain(`case-${id.slice(0, 8)}-underwriting-report.pdf`);
  expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("case report requires a session and rejects unknown cases", async ({ request, authenticatedPage: page }) => {
  expect((await request.get(`/api/cases/${randomUUID()}/pdf`)).status()).toBe(401);
  expect((await page.request.get("/api/cases/not-a-uuid/pdf")).status()).toBe(400);
  expect((await page.request.get(`/api/cases/${randomUUID()}/pdf`)).status()).toBe(404);
});
