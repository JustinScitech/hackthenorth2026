import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { discoverPublicSources, parseSearchResults, rankCandidates, searchQuery, searchUrl, selectSource, type SearchResult } from "./source-discovery";

// A saved DuckDuckGo HTML results page; no test here reaches the network or Browserbase.
const fixture = readFileSync(new URL("./fixtures/duckduckgo-results.html", import.meta.url), "utf8");
const target = { insuredName: "Ridgeway Distribution LLC", state: "NJ" };

test("parses organic results in page order, skipping sponsored blocks", () => {
  const results = parseSearchResults(fixture);
  assert.deepEqual(results.map((result) => new URL(result.url).hostname), [
    "www.zillow.com", "www.nj.gov", "assessor.essexcountynj.gov", "oldportal.co.essex.nj.us", "www.yelp.com", "www.tax.ny.gov",
  ]);
  assert.ok(!results.some((result) => /propertyshark/.test(result.url)), "the ad block must not appear");
});

test("unwraps the redirect link, decodes entities, and strips highlight tags", () => {
  const results = parseSearchResults(fixture);
  assert.equal(results[0].url, "https://www.zillow.com/homedetails/125-Wellington-Rd-Newark-NJ-07105/38812345_zpid/");
  assert.equal(results[2].title, "Essex County Assessor & Property Record Card - Parcel 0421-00017");
  assert.equal(results[2].snippet, "Owner: Ridgeway Distribution LLC. 125 Wellington Road, Newark NJ 07105. Year Built: 1965. Construction: Masonry.");
  assert.equal(results[4].url, "https://www.yelp.com/biz/ridgeway-distribution-newark");
});

test("pages without results parse to nothing", () => {
  assert.deepEqual(parseSearchResults(""), []);
  assert.deepEqual(parseSearchResults("<html><body><p>No results.</p></body></html>"), []);
  assert.deepEqual(parseSearchResults('<div class="result web-result"><a class="result__a">no href</a></div>'), []);
});

test("ranks the in-state county assessor first with an explained confidence", () => {
  const candidates = rankCandidates(parseSearchResults(fixture), target);
  assert.equal(candidates.length, 3);
  assert.equal(new URL(candidates[0].url).hostname, "assessor.essexcountynj.gov");
  assert.equal(candidates[0].confidence, 1);
  assert.match(candidates[0].reason, /government domain/);
  assert.match(candidates[0].reason, /property-record page/);
  assert.match(candidates[0].reason, /NJ/);
  assert.match(candidates[0].reason, /2 of 2 name words/);
  assert.deepEqual(candidates.map((candidate) => new URL(candidate.url).hostname), ["assessor.essexcountynj.gov", "www.nj.gov", "www.zillow.com"]);
  assert.deepEqual(candidates.map((candidate) => candidate.confidence), [1, 0.65, 0.3]);
});

test("candidates that fail the public-source guard are dropped before ranking", () => {
  const results: SearchResult[] = [
    { url: "http://oldportal.co.essex.nj.us/taxrecords/1", title: "Essex County Tax Records", snippet: "Ridgeway Distribution" },
    { url: "https://assessor.internal/parcel/1", title: "Essex County Assessor", snippet: "Ridgeway Distribution" },
    { url: "https://10.0.0.8/parcel/1", title: "Essex County Assessor", snippet: "Ridgeway Distribution" },
    { url: "not a url", title: "Essex County Assessor", snippet: "Ridgeway Distribution" },
    { url: "https://assessor.essexcountynj.gov/parcel/1", title: "Essex County Assessor", snippet: "Ridgeway Distribution" },
  ];
  const candidates = rankCandidates(results, target);
  assert.deepEqual(candidates.map((candidate) => candidate.url), ["https://assessor.essexcountynj.gov/parcel/1"]);
});

test("an assessor in a different state loses to in-state results and listing sites sink", () => {
  const ny: SearchResult = { url: "https://www.tax.ny.gov/pit/property/assess/local/", title: "Assessors - NYS Department of Taxation and Finance", snippet: "Find your local assessor in New York State." };
  const zillow: SearchResult = { url: "https://www.zillow.com/homedetails/125-Wellington-Rd-Newark-NJ-07105/1_zpid/", title: "125 Wellington Rd, Newark, NJ 07105 | Zillow", snippet: "Ridgeway Distribution building." };
  const [first, second] = rankCandidates([ny, zillow], target);
  assert.equal(new URL(first.url).hostname, "www.zillow.com");
  assert.match(first.reason, /listing or social site/);
  assert.equal(new URL(second.url).hostname, "www.tax.ny.gov");
  assert.match(second.reason, /New York rather than New Jersey/);
  assert.equal(second.confidence, 0.25);
});

test("duplicate URLs collapse, the limit holds, and unmatched results are not offered", () => {
  const gov = (n: number): SearchResult => ({ url: `https://assessor.essexcountynj.gov/parcel/${n}`, title: `Parcel ${n} - Essex County Assessor`, snippet: "Ridgeway Distribution LLC, Newark NJ" });
  const results = [gov(1), { ...gov(1), url: "https://assessor.essexcountynj.gov/parcel/1#top" }, gov(2), gov(3), gov(4),
    { url: "https://example.com/blog/post", title: "Ten tips for warehouses", snippet: "Nothing relevant here." }];
  const candidates = rankCandidates(results, target);
  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates.map((candidate) => candidate.url), ["https://assessor.essexcountynj.gov/parcel/1", "https://assessor.essexcountynj.gov/parcel/2", "https://assessor.essexcountynj.gov/parcel/3"]);
  assert.equal(rankCandidates(results, target, 2).length, 2);
  assert.deepEqual(rankCandidates([{ url: "https://example.com/blog/post", title: "Ten tips", snippet: "Nothing." }], target), []);
});

test("an insured name made of stopwords still ranks by domain and state", () => {
  const candidates = rankCandidates(parseSearchResults(fixture), { insuredName: "The Company LLC", state: "NJ" });
  assert.equal(new URL(candidates[0].url).hostname, "assessor.essexcountynj.gov");
  assert.equal(candidates[0].confidence, 0.7);
  assert.ok(!/name words/.test(candidates[0].reason));
});

test("the search query names the insured, the state, and the assessor record", () => {
  const query = searchQuery({ insuredName: "Ridgeway Distribution LLC", state: "NJ", address: "125 Wellington Road, Newark NJ 07105" });
  assert.match(query, /Ridgeway Distribution LLC/);
  assert.match(query, /New Jersey/);
  assert.match(query, /assessor/);
  assert.match(query, /125 Wellington Road/);
  const url = searchUrl(query);
  assert.equal(url.hostname, "html.duckduckgo.com");
  assert.equal(url.searchParams.get("q"), query);
});

test("discovery runs the injected search and returns ranked candidates without touching the network", async () => {
  const queries: string[] = [];
  const candidates = await discoverPublicSources(target, async (query) => { queries.push(query); return fixture; });
  assert.equal(queries.length, 1);
  assert.equal(candidates[0].url, "https://assessor.essexcountynj.gov/parcel/0421-00017");
  assert.ok(candidates.every((candidate) => candidate.url.startsWith("https://")));
  assert.deepEqual(await discoverPublicSources(target, async () => "<html></html>"), []);
  await assert.rejects(discoverPublicSources(target, async () => { throw new Error("session timed out"); }), /session timed out/);
});

test("selecting a source validates the URL and reports whether it was a discovered candidate", () => {
  const candidates = rankCandidates(parseSearchResults(fixture), target);
  const picked = selectSource(candidates, "https://assessor.essexcountynj.gov/parcel/0421-00017");
  assert.equal(picked.candidate?.confidence, 1);
  assert.equal(selectSource(candidates, "https://www.example.com/other").candidate, null);
  assert.equal(selectSource(null, "https://www.example.com/other").url, "https://www.example.com/other");
  assert.throws(() => selectSource(candidates, "http://assessor.essexcountynj.gov/parcel/0421-00017"), /public HTTPS/);
  assert.throws(() => selectSource(candidates, "https://localhost/parcel"), /public HTTPS/);
});
