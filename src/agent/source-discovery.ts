import { publicSourceUrl } from "./public-source-url";

/**
 * Finds candidate public records for a case that arrived without a source URL.
 * A Browserbase session runs one web search for the county assessor / property
 * record; the results are ranked by a pure scorer so the underwriter confirms a
 * URL rather than the agent fetching whatever came first. Every candidate has
 * already passed the same SSRF guard the fetch uses.
 */
export type SearchResult = { url: string; title: string; snippet: string };
export type SourceCandidate = { url: string; title: string; snippet: string; confidence: number; reason: string };
export type DiscoveryTarget = { insuredName: string; state: string; address?: string | null };
/** Returns the HTML of a search results page for the query. Injected so tests never reach the network. */
export type SearchFetcher = (query: string) => Promise<string>;

export const MAX_CANDIDATES = 3;

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** Words that appear in almost every business name and say nothing about which page is the right one. */
const NAME_STOPWORDS = new Set(["llc", "inc", "corp", "co", "company", "ltd", "lp", "llp", "plc", "the", "of", "and", "group", "holdings", "properties", "property", "partners", "associates", "trust", "dba", "enterprises", "international"]);
/** Marketing, listing, and social hosts: they may mention the insured, but they are not a record. */
const LOW_TRUST_LABELS = new Set(["zillow", "redfin", "realtor", "trulia", "loopnet", "crexi", "yelp", "facebook", "linkedin", "instagram", "twitter", "x", "youtube", "pinterest", "wikipedia", "propertyshark", "homes", "apartments", "bizapedia", "manta", "opencorporates"]);
/** Pages that are a record of one property, as opposed to a portal that merely leads to one. */
const RECORD_TERMS = /assessor|appraiser|appraisal|parcel|property[- ]?(?:record|card)|recorder|deed|land[- ]?records/;
const PORTAL_TERMS = /\btax|gis|property[- ]?(?:search|info|lookup)/;

const SEARCH_ENDPOINT = "https://html.duckduckgo.com/html/";

const decodeEntities = (value: string) => value
  .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
const stripTags = (value: string) => decodeEntities(value.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/** DuckDuckGo wraps organic links in a redirect (`/l/?uddg=<encoded target>`); ads go through `y.js`. */
function resultUrl(href: string): string | null {
  const raw = decodeEntities(href.trim());
  const absolute = raw.startsWith("//") ? `https:${raw}` : raw;
  try {
    const url = new URL(absolute);
    if (/duckduckgo\.com$/i.test(url.hostname)) {
      const target = url.searchParams.get("uddg");
      return target && /^https?:\/\//i.test(target) ? target : null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** Parses a DuckDuckGo HTML results page into organic results, in page order. Sponsored blocks are skipped. */
export function parseSearchResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = html.split(/(?=<div\s+class="result\b)/);
  for (const block of blocks) {
    const opening = block.match(/^<div\s+class="([^"]*)"/);
    if (!opening || /\bresult--ad\b/.test(opening[1])) continue;
    const link = block.match(/<a[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const url = resultUrl(link[1]);
    const title = stripTags(link[2]);
    if (!url || !title) continue;
    const snippet = block.match(/<a[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    results.push({ url, title, snippet: snippet ? stripTags(snippet[1]) : "" });
  }
  return results;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nameTokens = (insuredName: string) => [...new Set(insuredName.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3 && !NAME_STOPWORDS.has(token)))];
const normalizeUrl = (url: URL) => { const copy = new URL(url.toString()); copy.hash = ""; return copy.toString().replace(/\/$/, ""); };

/**
 * Scores one result for a case. Each criterion adds a fixed amount and names
 * itself in the reason, so the underwriter can see why a page was offered:
 * a government domain, a property-record page, a state match, and how much of
 * the insured name appears. Listing sites and other-state records are marked down.
 */
function scoreResult(result: SearchResult, url: URL, target: DiscoveryTarget): { confidence: number; reason: string } {
  const abbr = target.state.trim().toUpperCase();
  const stateName = STATE_NAMES[abbr] ?? abbr;
  const host = url.hostname.toLowerCase();
  const address = `${host}${url.pathname}`.toLowerCase();
  const text = `${result.title} ${result.snippet}`;
  const lower = text.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  if (/\.gov$|\.gov\.[a-z]{2}$|\.[a-z]{2}\.us$/.test(host)) { score += 0.35; reasons.push("government domain"); }
  if (RECORD_TERMS.test(address) || RECORD_TERMS.test(lower)) { score += 0.15; reasons.push("property-record page"); }
  else if (PORTAL_TERMS.test(address) || PORTAL_TERMS.test(lower)) { score += 0.1; reasons.push("tax or property portal"); }

  const abbrLower = abbr.toLowerCase();
  const hostState = new RegExp(`(^|[./-]|county|city|co|state)${escapeRegExp(abbrLower)}([./-]|$)`).test(address);
  const textState = new RegExp(`\\b${escapeRegExp(abbr)}\\b`).test(text) || lower.includes(stateName.toLowerCase());
  if (hostState || textState) { score += 0.2; reasons.push(`mentions ${abbr}`); }
  else {
    const other = Object.entries(STATE_NAMES).find(([code, name]) => code !== abbr && lower.includes(name.toLowerCase()));
    if (other) { score -= 0.25; reasons.push(`mentions ${other[1]} rather than ${stateName}`); }
  }

  const tokens = nameTokens(target.insuredName);
  if (tokens.length) {
    const matched = tokens.filter((token) => new RegExp(`\\b${escapeRegExp(token)}\\b`).test(lower)).length;
    if (matched) { score += Math.round((0.3 * matched) / tokens.length * 100) / 100; reasons.push(`matches ${matched} of ${tokens.length} name words`); }
  }

  const labels = host.split(".");
  const domainLabel = labels.length >= 2 ? labels[labels.length - 2] : host;
  if (LOW_TRUST_LABELS.has(domainLabel)) { score -= 0.2; reasons.push("listing or social site"); }

  const confidence = Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
  return { confidence, reason: reasons.length ? reasons.join("; ") : "no signals matched" };
}

/**
 * Turns raw results into the short list the underwriter sees: guarded URLs only,
 * deduplicated, scored, sorted best first, and cut to `limit`. Results that match
 * nothing (or net negative) are left out rather than offered as a guess.
 */
export function rankCandidates(results: SearchResult[], target: DiscoveryTarget, limit = MAX_CANDIDATES): SourceCandidate[] {
  const seen = new Set<string>();
  const scored: SourceCandidate[] = [];
  for (const result of results) {
    let url: URL;
    try { url = publicSourceUrl(result.url); } catch { continue; }
    const key = normalizeUrl(url);
    if (seen.has(key)) continue;
    seen.add(key);
    const { confidence, reason } = scoreResult(result, url, target);
    if (confidence <= 0) continue;
    scored.push({ url: url.toString(), title: result.title.slice(0, 200), snippet: result.snippet.slice(0, 300), confidence, reason });
  }
  // Array.prototype.sort is stable, so equal scores keep the search engine's order.
  return scored.sort((left, right) => right.confidence - left.confidence).slice(0, Math.max(0, limit));
}

export function searchQuery(target: DiscoveryTarget): string {
  const abbr = target.state.trim().toUpperCase();
  const place = STATE_NAMES[abbr] ? `${STATE_NAMES[abbr]} ${abbr}` : abbr;
  const address = target.address?.trim();
  return [target.insuredName.trim(), address, place, "county assessor property record"].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 300);
}

/** The one URL discovery ever navigates to; it passes the same guard as every candidate. */
export function searchUrl(query: string): URL {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("q", query);
  return publicSourceUrl(url.toString());
}

/** Loads the results page through a Browserbase session so the search runs from a real browser, not the app's network. */
export async function browserbaseSearch(query: string): Promise<string> {
  const { default: Browserbase } = await import("@browserbasehq/sdk");
  const browserbase = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY, timeout: 30_000, maxRetries: 1 });
  const session = await browserbase.sessions.create({ api_timeout: 90 });
  let browser: import("playwright-core").Browser | undefined;
  try {
    const { chromium } = await import("playwright-core");
    browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 30_000 });
    const context = browser.contexts()[0];
    await context.route("**/*", (route) => {
      try { publicSourceUrl(route.request().url()); return route.continue(); }
      catch { return route.abort(); }
    });
    const page = context.pages()[0] ?? await context.newPage();
    const response = await page.goto(searchUrl(query).toString(), { waitUntil: "domcontentloaded", timeout: 25_000 });
    if (!response || !response.ok()) throw new Error(`Search returned HTTP ${response?.status() ?? "unknown"}.`);
    return await page.content();
  } finally {
    await browser?.close().catch(() => {});
    await browserbase.sessions.update(session.id, { status: "REQUEST_RELEASE" }).catch(() => {});
  }
}

/** Runs the search and ranks what came back. Errors from the search propagate so the caller can record them. */
export async function discoverPublicSources(target: DiscoveryTarget, search: SearchFetcher = browserbaseSearch): Promise<SourceCandidate[]> {
  const html = await search(searchQuery(target));
  return rankCandidates(parseSearchResults(html), target);
}

/** The underwriter's pick: validated like any source URL, and matched back to a candidate when it was one of them. */
export function selectSource(candidates: SourceCandidate[] | null | undefined, value: string): { url: string; candidate: SourceCandidate | null } {
  const url = publicSourceUrl(value);
  const key = normalizeUrl(url);
  const candidate = (candidates ?? []).find((item) => { try { return normalizeUrl(new URL(item.url)) === key; } catch { return false; } }) ?? null;
  return { url: url.toString(), candidate };
}
