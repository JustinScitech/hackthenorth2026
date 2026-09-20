import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";
import { extractEvidenceSignals } from "./enrichment";
import type { PublicEvidence } from "../lib/types";
import { publicSourceUrl } from "./public-source-url";

export type { PublicEvidence };

export async function browsePublicSource(value: string): Promise<PublicEvidence> {
  const url = publicSourceUrl(value);
  const browserbase = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY, timeout: 30_000, maxRetries: 1 });
  const session = await browserbase.sessions.create({ api_timeout: 120 });
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  try {
    browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 30_000 });
    const context = browser.contexts()[0];
    await context.route("**/*", (route) => {
      try { publicSourceUrl(route.request().url()); return route.continue(); }
      catch { return route.abort(); }
    });
    const page = context.pages()[0] ?? await context.newPage();
    const response = await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 25_000 });
    if (!response || !response.ok()) throw new Error(`Source returned HTTP ${response?.status() ?? "unknown"}; no evidence captured.`);
    const finalUrl = publicSourceUrl(page.url());
    const title = (await page.title()).slice(0, 200);
    const text = (await page.locator("body").innerText({ timeout: 10_000 })).replace(/\s+/g, " ").trim();
    if (!text) throw new Error("The source page has no readable text.");
    // Signals come from the whole page; only a short excerpt is stored for display.
    return { url: finalUrl.toString(), title, excerpt: text.slice(0, 1200), signals: extractEvidenceSignals(text.slice(0, 50_000)) };
  } finally {
    await browser?.close().catch(() => {});
    await browserbase.sessions.update(session.id, { status: "REQUEST_RELEASE" }).catch(() => {});
  }
}
