import { readFileSync } from "node:fs";
import { discoverPublicSources, parseSearchResults, rankCandidates, type SearchResult, type SourceCandidate } from "../../src/agent/source-discovery";
import { publicSourceUrl } from "../../src/agent/public-source-url";
import { attempt, attemptAsync, type CaseResult, type Suite } from "../runner";

/**
 * Browserbase source discovery: when the broker supplied no public URL, a web
 * search for the county assessor record is ranked into a short list the
 * underwriter confirms. The search itself is not evaluated here; the ranking
 * that decides what the underwriter sees is, from a saved results page.
 */
const searchPage = readFileSync(new URL("../../src/agent/fixtures/duckduckgo-results.html", import.meta.url), "utf8");
const ridgeway = { insuredName: "Ridgeway Distribution LLC", state: "NJ", address: "125 Wellington Road, Newark NJ 07105" };

const result = (url: string, title: string, snippet: string): SearchResult => ({ url, title, snippet });
const host = (candidate: SourceCandidate) => new URL(candidate.url).hostname;

const rankingCases: { name: string; results: SearchResult[]; target: { insuredName: string; state: string }; check: (candidates: SourceCandidate[]) => string[]; note?: string }[] = [
  { name: "county assessor record outranks a listing site for the same insured", results: parseSearchResults(searchPage), target: ridgeway, check: (c) => [
    host(c[0]) === "assessor.essexcountynj.gov" ? "" : `first candidate ${host(c[0])}`,
    c.some((item) => host(item) === "www.zillow.com") && c.findIndex((item) => host(item) === "www.zillow.com") > 0 ? "" : "the listing should be offered, but not first",
  ].filter(Boolean), note: "Assessor cards carry year built, construction and use; listings are marketing copy." },
  { name: "an assessor in another state ranks below every in-state result", results: parseSearchResults(searchPage), target: ridgeway, check: (c) => [
    c.every((item) => host(item) !== "www.tax.ny.gov") ? "" : "the New York assessor was offered for a New Jersey risk",
  ].filter(Boolean), note: "A wrong-state record would have the underwriter confirm the wrong parcel." },
  { name: "at most three candidates, best first", results: parseSearchResults(searchPage), target: ridgeway, check: (c) => [
    c.length >= 2 && c.length <= 3 ? "" : `${c.length} candidates`,
    c.every((item, index) => index === 0 || item.confidence <= c[index - 1].confidence) ? "" : "not sorted by confidence",
  ].filter(Boolean) },
  { name: "every candidate passes the public-source guard and explains itself", results: [
    result("http://oldportal.co.essex.nj.us/taxrecords/1", "Essex County Tax Records", "Ridgeway Distribution"),
    result("https://assessor.internal/parcel/1", "Essex County Assessor", "Ridgeway Distribution"),
    result("https://127.0.0.1/parcel/1", "Essex County Assessor", "Ridgeway Distribution"),
    ...parseSearchResults(searchPage),
  ], target: ridgeway, check: (c) => [
    ...c.map((item) => { try { publicSourceUrl(item.url); return ""; } catch { return `${item.url} fails the guard`; } }),
    ...c.map((item) => item.reason.trim().length > 0 && item.confidence >= 0 && item.confidence <= 1 ? "" : `${item.url} lacks a reason or has confidence ${item.confidence}`),
  ].filter(Boolean), note: "Every discovered URL is later fetched by the browser; the SSRF guard has to hold before the underwriter ever sees it." },
  { name: "sponsored results are never candidates", results: parseSearchResults(searchPage), target: ridgeway, check: (c) => [c.some((item) => /propertyshark/.test(item.url)) ? "an ad became a candidate" : ""].filter(Boolean) },
  { name: "nothing relevant means no candidates rather than a guess", results: [result("https://example.com/blog", "Ten warehouse tips", "General advice."), result("https://example.org/news", "Local news", "Weather and sports.")], target: ridgeway, check: (c) => [c.length === 0 ? "" : `offered ${c.map(host)}`].filter(Boolean), note: "An empty picker with a manual URL field beats confirming an unrelated page." },
  { name: "a generic insured name still ranks by government domain and state", results: parseSearchResults(searchPage), target: { insuredName: "The Company LLC", state: "NJ" }, check: (c) => [host(c[0]) === "assessor.essexcountynj.gov" ? "" : `first candidate ${host(c[0])}`].filter(Boolean) },
  { name: "state match is by name or abbreviation, not by coincidence", results: [
    result("https://www.boca.gov/planning", "Boca Raton Planning", "Development review."),
    result("https://www.ca.gov/property", "California property records", "Statewide records."),
  ], target: { insuredName: "Pacific Cold Storage Inc", state: "CA" }, check: (c) => [
    host(c[0]) === "www.ca.gov" ? "" : `first candidate ${host(c[0])}`,
    c.find((item) => host(item) === "www.boca.gov") && /CA|California/.test(c.find((item) => host(item) === "www.boca.gov")!.reason) ? "boca.gov matched CA by accident" : "",
  ].filter(Boolean) },
];

export const discoverySuite: Suite = {
  name: "discovery",
  description: "Public-source discovery: ranking assessor candidates from a web search for the underwriter to confirm",
  async run() {
    const results: CaseResult[] = [];
    for (const item of rankingCases) results.push(attempt(`ranking: ${item.name}`, () => item.check(rankCandidates(item.results, item.target)), item.note));
    results.push(await attemptAsync("search: a mocked Browserbase search yields ranked candidates", async () => {
      const candidates = await discoverPublicSources(ridgeway, async () => searchPage);
      return [candidates.length >= 2 ? "" : `${candidates.length} candidates`, host(candidates[0]) === "assessor.essexcountynj.gov" ? "" : `first ${host(candidates[0])}`].filter(Boolean);
    }, "The live search is exercised end to end; here the page is saved so the ranking is measured deterministically."));
    results.push(await attemptAsync("search: an empty results page yields no candidates", async () => {
      const candidates = await discoverPublicSources(ridgeway, async () => "<html><body>No results.</body></html>");
      return [candidates.length === 0 ? "" : `offered ${candidates.length}`].filter(Boolean);
    }));
    return results;
  },
};
