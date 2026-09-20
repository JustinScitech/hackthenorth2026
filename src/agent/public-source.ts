import Browserbase from "@browserbasehq/sdk";
import type { Browser } from "playwright-core";
import { extractEvidence } from "./evidence-model";
import type { PublicEvidence } from "../lib/types";
import { publicSourceUrl } from "./public-source-url";

export type { PublicEvidence };

export type CapturedPage = { url: string; title: string; text: string };

/** Fetches the page in a Browserbase session and reads its signals: the regex parser, then the model pass when Gemini is configured. */
export async function browsePublicSource(value: string, capture: (value: string, signal?: AbortSignal) => Promise<CapturedPage> = capturePublicPage, signal?: AbortSignal): Promise<PublicEvidence> {
  signal?.throwIfAborted();
  const { url, title, text } = await capture(value, signal);
  signal?.throwIfAborted();
  // Signals come from the whole page; only a short excerpt is stored for display. The browser session is already released here.
  const { signals, conflicts, model } = await extractEvidence(text.slice(0, 50_000));
  signal?.throwIfAborted();
  return { url, title, excerpt: text.slice(0, 1200), signals, conflicts, extraction: model };
}

export async function capturePublicPage(value: string, signal?: AbortSignal): Promise<CapturedPage> {
  signal?.throwIfAborted();
  const url = publicSourceUrl(value);
  const browserbase = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY, timeout: 30_000, maxRetries: 1 });
  const session = await browserbase.sessions.create({ api_timeout: 120 });
  let browser: Browser | undefined;
  const closeOnAbort = () => { void browser?.close().catch(() => {}); };
  signal?.addEventListener("abort", closeOnAbort, { once: true });
  try {
    signal?.throwIfAborted();
    // Loaded here rather than at module scope so that a missing browser asset can only fail this
    // optional step, not every route that imports the job queue (Vercel traces the package lazily).
    const { chromium } = await import("playwright-core");
    browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 30_000 });
    signal?.throwIfAborted();
    const context = browser.contexts()[0];
    await context.route("**/*", (route) => {
      try { publicSourceUrl(route.request().url()); return route.continue(); }
      catch { return route.abort(); }
    });
    const page = context.pages()[0] ?? await context.newPage();
    const response = await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 25_000 });
    signal?.throwIfAborted();
    if (!response || !response.ok()) throw new Error(`Source returned HTTP ${response?.status() ?? "unknown"}; no evidence captured.`);
    const finalUrl = publicSourceUrl(page.url());
    const title = (await page.title()).slice(0, 200);
    const text = (await page.locator("body").innerText({ timeout: 10_000 })).replace(/\s+/g, " ").trim();
    if (!text) throw new Error("The source page has no readable text.");
    return { url: finalUrl.toString(), title, text };
  } finally {
    signal?.removeEventListener("abort", closeOnAbort);
    await browser?.close().catch(() => {});
    await browserbase.sessions.update(session.id, { status: "REQUEST_RELEASE" }).catch(() => {});
  }
}
