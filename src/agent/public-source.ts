import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";
import { publicSourceUrl } from "./public-source-url";

export type PublicEvidence = { url: string; title: string; excerpt: string };

export async function browsePublicSource(value: string): Promise<PublicEvidence> {
  const url = publicSourceUrl(value);
  const browserbase = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY, timeout: 30_000, maxRetries: 1 });
  const session = await browserbase.sessions.create();
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  try {
    browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 30_000 });
    const context = browser.contexts()[0];
    await context.route("**/*", (route) => {
      try { publicSourceUrl(route.request().url()); return route.continue(); }
      catch { return route.abort(); }
    });
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 25_000 });
    const finalUrl = publicSourceUrl(page.url());
    const title = (await page.title()).slice(0, 200);
    const excerpt = (await page.locator("body").innerText({ timeout: 10_000 })).replace(/\s+/g, " ").trim().slice(0, 1200);
    if (!excerpt) throw new Error("The source page has no readable text.");
    return { url: finalUrl.toString(), title, excerpt };
  } finally {
    await browser?.close().catch(() => {});
    await browserbase.sessions.update(session.id, { status: "REQUEST_RELEASE" }).catch(() => {});
  }
}
