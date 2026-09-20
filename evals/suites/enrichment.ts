import { evidenceFindings, extractEvidenceSignals, type EvidenceSignal } from "../../src/agent/enrichment";
import { extractEvidence, mergeEvidenceSignals, parseModelSignals } from "../../src/agent/evidence-model";
import type { Facts, Finding } from "../../src/lib/types";
import { attempt, attemptAsync, same, type CaseResult, type Suite } from "../runner";

/**
 * Browserbase / Federato enrichment: a public page fetched by the browser
 * becomes structured, cited signals, and those signals change what the
 * underwriter sees: corroboration, contradiction, or a new risk. The live
 * fetch is not evaluated here; what the agent does with the page is.
 */
const assessor = `Property Record Card — 125 Wellington Road, Newark NJ 07105
Parcel: 0421-00017. Owner: Ridgeway Distribution LLC.
Year Built: 1965. Effective Year: 1988. Construction: Masonry. Stories: 1.
Building Sq Ft: 42,000. Use Code: 4300 Warehouse / Distribution.
Fire Protection: Sprinklered: Yes. FEMA Flood Zone: AE (Special Flood Hazard Area).
Assessed Value (2025): $3,100,000.`;

const listing = `FOR LEASE — Modern Flex Space. Built in 2018, 18,500 SF tilt-up concrete building with ESFR sprinkler system.
Zone X (minimal flood risk) per FEMA map 34013C0112F. Ideal for light industrial or showroom use.
Contact the listing broker for more information.`;

const noise = `Welcome to our website! Cookie policy. Sign in. Subscribe to our newsletter for the latest updates. 2024 Annual Report available. Call 555-0100.`;

const facts = (overrides: Partial<Record<keyof Facts, number | string | null>> = {}): Facts => ({
  state: { value: "NJ", source: "Intake form", confidence: 1 },
  tiv: { value: 4_300_000, source: "Intake form", confidence: 1 },
  yearBuilt: { value: 1965, source: "Broker text via Parser", confidence: 0.75 },
  losses: { value: 1, source: "Intake form", confidence: 1 },
  ...Object.fromEntries(Object.entries(overrides).map(([key, value]) => [key, { value, source: "Intake form", confidence: 1 }])),
} as Facts);
const evidence = { url: "https://assessor.example.gov/parcel/0421-00017", title: "Property Record Card", excerpt: assessor.slice(0, 1200) };

const signal = (signals: EvidenceSignal[], kind: EvidenceSignal["kind"]) => signals.find((item) => item.kind === kind);
const finding = (findings: Finding[], id: string) => findings.find((item) => item.id === id);

const signalCases: { name: string; text: string; check: (signals: EvidenceSignal[]) => string[]; note?: string }[] = [
  { name: "assessor card yields year, construction, size, use, sprinklers, flood zone", text: assessor, check: (s) => [
    signal(s, "yearBuilt")?.value === 1965 ? "" : `yearBuilt ${signal(s, "yearBuilt")?.value}`,
    /masonry/i.test(String(signal(s, "constructionType")?.value)) ? "" : `constructionType ${signal(s, "constructionType")?.value}`,
    signal(s, "squareFeet")?.value === 42_000 ? "" : `squareFeet ${signal(s, "squareFeet")?.value}`,
    /warehouse/i.test(String(signal(s, "occupancy")?.value)) ? "" : `occupancy ${signal(s, "occupancy")?.value}`,
    signal(s, "sprinklered")?.value === true ? "" : `sprinklered ${signal(s, "sprinklered")?.value}`,
    signal(s, "floodZone")?.value === "AE" ? "" : `floodZone ${signal(s, "floodZone")?.value}`,
  ].filter(Boolean) },
  { name: "effective year is not the year built", text: assessor, check: (s) => [signal(s, "yearBuilt")?.value === 1965 ? "" : "effective year 1988 must not replace 1965"].filter(Boolean), note: "Assessor cards list an 'effective year' after renovations; the guideline needs original construction." },
  { name: "every signal carries the sentence it came from", text: assessor, check: (s) => s.map((item) => item.quote.trim().length >= 8 && assessor.includes(item.quote.trim()) ? "" : `${item.kind} quote is not verbatim page text`).filter(Boolean) },
  { name: "listing prose yields built year, sprinklers, size, and a low-risk flood zone", text: listing, check: (s) => [
    signal(s, "yearBuilt")?.value === 2018 ? "" : `yearBuilt ${signal(s, "yearBuilt")?.value}`,
    signal(s, "sprinklered")?.value === true ? "" : `sprinklered ${signal(s, "sprinklered")?.value}`,
    signal(s, "squareFeet")?.value === 18_500 ? "" : `squareFeet ${signal(s, "squareFeet")?.value}`,
    signal(s, "floodZone")?.value === "X" ? "" : `floodZone ${signal(s, "floodZone")?.value}`,
  ].filter(Boolean) },
  { name: "page chrome and a report year produce no signals", text: noise, check: (s) => [s.length === 0 ? "" : `unexpected signals ${s.map((item) => item.kind)}`].filter(Boolean), note: "'2024 Annual Report' must not become a construction year." },
  { name: "flood map number is not a flood zone", text: listing, check: (s) => [s.filter((item) => item.kind === "floodZone").length === 1 ? "" : "exactly one flood zone signal expected"].filter(Boolean) },
  { name: "empty page yields nothing", text: "", check: (s) => [s.length === 0 ? "" : "signals from empty text"].filter(Boolean) },
];

const findingCases: { name: string; facts: Facts; signals: () => EvidenceSignal[]; check: (findings: Finding[]) => string[]; note?: string }[] = [
  { name: "matching year corroborates the broker", facts: facts(), signals: () => [{ kind: "yearBuilt", value: 1965, quote: "Year Built: 1965." }], check: (f) => [finding(f, "evidence_yearBuilt")?.result === "pass" ? "" : `result ${finding(f, "evidence_yearBuilt")?.result}`, /1965/.test(finding(f, "evidence_yearBuilt")?.detail ?? "") ? "" : "detail should cite the year"].filter(Boolean) },
  { name: "conflicting year is referred with both values", facts: facts({ yearBuilt: 2005 }), signals: () => [{ kind: "yearBuilt", value: 1965, quote: "Year Built: 1965." }], check: (f) => [finding(f, "evidence_yearBuilt")?.result === "refer" ? "" : `result ${finding(f, "evidence_yearBuilt")?.result}`, /1965/.test(finding(f, "evidence_yearBuilt")?.detail ?? "") && /2005/.test(finding(f, "evidence_yearBuilt")?.detail ?? "") ? "" : "detail must show both years"].filter(Boolean), note: "A public record contradicting the submission is exactly what an underwriter must see before deciding." },
  { name: "public year does not silently fill a missing fact", facts: facts({ yearBuilt: null }), signals: () => [{ kind: "yearBuilt", value: 1965, quote: "Year Built: 1965." }], check: (f) => [finding(f, "evidence_yearBuilt")?.result === "unknown" ? "" : `result ${finding(f, "evidence_yearBuilt")?.result}`, /confirm|verify/i.test(finding(f, "evidence_yearBuilt")?.detail ?? "") ? "" : "detail should ask to confirm with the broker"].filter(Boolean), note: "Unverified web data can inform a question, not replace a fact." },
  { name: "special flood hazard zone is a new referral", facts: facts(), signals: () => [{ kind: "floodZone", value: "AE", quote: "FEMA Flood Zone: AE" }], check: (f) => [finding(f, "evidence_floodZone")?.result === "refer" ? "" : `result ${finding(f, "evidence_floodZone")?.result}`].filter(Boolean) },
  { name: "minimal flood zone passes", facts: facts(), signals: () => [{ kind: "floodZone", value: "X", quote: "Zone X" }], check: (f) => [finding(f, "evidence_floodZone")?.result === "pass" ? "" : `result ${finding(f, "evidence_floodZone")?.result}`].filter(Boolean) },
  { name: "unsprinklered building is referred, sprinklered passes", facts: facts(), signals: () => [{ kind: "sprinklered", value: false, quote: "Sprinklered: No" }], check: (f) => [finding(f, "evidence_sprinklered")?.result === "refer" ? "" : `result ${finding(f, "evidence_sprinklered")?.result}`, evidenceFindings(facts(), evidence, [{ kind: "sprinklered", value: true, quote: "Sprinklered: Yes" }]).find((item) => item.id === "evidence_sprinklered")?.result === "pass" ? "" : "sprinklered true should pass"].filter(Boolean) },
  { name: "frame construction is referred, masonry passes", facts: facts(), signals: () => [{ kind: "constructionType", value: "Wood Frame", quote: "Construction: Wood Frame" }], check: (f) => [finding(f, "evidence_constructionType")?.result === "refer" ? "" : `result ${finding(f, "evidence_constructionType")?.result}`, evidenceFindings(facts(), evidence, [{ kind: "constructionType", value: "Masonry", quote: "Construction: Masonry" }]).find((item) => item.id === "evidence_constructionType")?.result === "pass" ? "" : "masonry should pass"].filter(Boolean) },
  { name: "no signals produce one honest unknown", facts: facts(), signals: () => [], check: (f) => [f.length === 1 && f[0].result === "unknown" ? "" : `findings ${JSON.stringify(f.map((item) => [item.id, item.result]))}`].filter(Boolean) },
  { name: "every evidence finding names the host and quotes the page", facts: facts({ yearBuilt: 2005 }), signals: () => extractEvidenceSignals(assessor), check: (f) => f.map((item) => item.source.includes("assessor.example.gov") && /Year Built|Construction|Sq Ft|Use Code|Sprinklered|Flood Zone/.test(item.detail) ? "" : `${item.id} lacks host or quote`).filter(Boolean) },
  { name: "evidence never approves or binds", facts: facts(), signals: () => extractEvidenceSignals(listing), check: (f) => f.map((item) => /approve|bind|accept/i.test(item.detail) ? `${item.id} uses decision language` : "").filter(Boolean) },
  { name: "findings are deterministic for the same page", facts: facts(), signals: () => extractEvidenceSignals(assessor), check: (f) => [same(f, evidenceFindings(facts(), evidence, extractEvidenceSignals(assessor))) ? "" : "findings differ between runs"].filter(Boolean) },
];

/**
 * The model pass reads the same page as the regex parser. The parser output is the
 * floor: the model may add a signal it can quote, and may agree, but a disagreement
 * has to reach the underwriter as a conflict rather than quietly replacing the value.
 */
const modelReply = (signals: unknown[]) => JSON.stringify({ signals });
type Merged = ReturnType<typeof mergeEvidenceSignals>;
const mergeCases: { name: string; page: string; model: unknown[] | string; check: (merged: Merged) => string[]; note?: string }[] = [
  { name: "model agreeing with the parser keeps one signal per fact and no conflict", page: assessor, model: [{ kind: "yearBuilt", value: 1965, quote: "Year Built: 1965." }, { kind: "constructionType", value: "masonry", quote: "Construction: Masonry." }], check: (m) => [
    m.conflicts.length === 0 ? "" : `unexpected conflicts ${m.conflicts}`,
    m.signals.filter((item) => item.kind === "yearBuilt").length === 1 ? "" : "year built duplicated",
    m.signals.find((item) => item.kind === "yearBuilt")?.agreement === "both" ? "" : "agreement should be recorded",
  ].filter(Boolean) },
  { name: "model year that differs from the parser becomes a conflict, not a replacement", page: assessor, model: [{ kind: "yearBuilt", value: 1988, quote: "Effective Year: 1988." }], check: (m) => [
    m.signals.find((item) => item.kind === "yearBuilt")?.value === 1965 ? "" : `parser value overwritten: ${m.signals.find((item) => item.kind === "yearBuilt")?.value}`,
    m.conflicts.length === 1 && /1965/.test(m.conflicts[0]) && /1988/.test(m.conflicts[0]) ? "" : `conflict missing or incomplete: ${JSON.stringify(m.conflicts)}`,
  ].filter(Boolean), note: "The effective year is a classic model misread; the underwriter must see both values, never a silently swapped one." },
  { name: "model-only signal with a verbatim quote is added and marked as model-read", page: listing, model: [{ kind: "occupancy", value: "light industrial or showroom", quote: "Ideal for light industrial or showroom use." }], check: (m) => {
    const occupancy = m.signals.find((item) => item.kind === "occupancy");
    return [occupancy ? "" : "occupancy missing", occupancy?.agreement === "model" ? "" : `agreement ${occupancy?.agreement}`, m.conflicts.length === 0 ? "" : `unexpected conflicts ${m.conflicts}`].filter(Boolean);
  } },
  { name: "model quote absent from the page is dropped", page: listing, model: [{ kind: "yearBuilt", value: 1999, quote: "Built in 1999" }], check: (m) => [
    m.signals.find((item) => item.kind === "yearBuilt")?.value === 2018 ? "" : `year ${m.signals.find((item) => item.kind === "yearBuilt")?.value}`,
    m.conflicts.length === 0 ? "" : `an unquoted value must not even raise a conflict: ${m.conflicts}`,
  ].filter(Boolean), note: "A fabricated quote is the model inventing evidence; it cannot be allowed to contradict the page." },
  { name: "malformed model JSON leaves the parser signals intact", page: assessor, model: "{ signals: [oops", check: (m) => [same(m.signals.map(({ kind, value }) => [kind, value]), extractEvidenceSignals(assessor).map(({ kind, value }) => [kind, value])) ? "" : "parser signals changed", m.conflicts.length === 0 ? "" : "conflict from garbage"].filter(Boolean) },
  { name: "model output never removes a parser signal", page: assessor, model: [{ kind: "sprinklered", value: false, quote: "Sprinklered: Yes." }, { kind: "squareFeet", value: 4200, quote: "Building Sq Ft: 42,000." }], check: (m) => [
    ...extractEvidenceSignals(assessor).map((signal) => m.signals.some((item) => item.kind === signal.kind && item.value === signal.value) ? "" : `${signal.kind} lost`),
    m.conflicts.length === 2 ? "" : `expected two conflicts, got ${JSON.stringify(m.conflicts)}`,
  ].filter(Boolean) },
];

const conflictEvidence = { ...evidence, conflicts: ["Year built differs: Parser 1965, Gemini 1988."] };

export const enrichmentSuite: Suite = {
  name: "enrichment",
  description: "Public-source enrichment: cited structured signals from fetched pages and their effect on findings",
  async run() {
    const results: CaseResult[] = [];
    for (const item of signalCases) results.push(attempt(`signals: ${item.name}`, () => item.check(extractEvidenceSignals(item.text)), item.note));
    for (const item of findingCases) results.push(attempt(`findings: ${item.name}`, () => item.check(evidenceFindings(item.facts, evidence, item.signals())), item.note));
    for (const item of mergeCases) results.push(attempt(`merge: ${item.name}`, () => item.check(mergeEvidenceSignals(extractEvidenceSignals(item.page), parseModelSignals(typeof item.model === "string" ? item.model : modelReply(item.model), item.page).signals)), item.note));
    results.push(attempt("merge: a conflict reaches the findings as a referral showing both values", () => {
      const findings = evidenceFindings(facts(), conflictEvidence, extractEvidenceSignals(assessor));
      const conflict = findings.find((item) => item.id.startsWith("evidence_conflict"));
      return [conflict?.result === "refer" ? "" : `result ${conflict?.result}`, /1965/.test(conflict?.detail ?? "") && /1988/.test(conflict?.detail ?? "") ? "" : "detail must show both values", conflict?.source.includes("assessor.example.gov") ? "" : "source must name the host"].filter(Boolean);
    }, "A parser/model disagreement is a referral, so it appears in the brief and the report rather than being averaged away."));
    results.push(await attemptAsync("merge: model failure or timeout falls back to the parser without failing the case", async () => {
      const failed = await extractEvidence(assessor, async () => { throw Object.assign(new Error("deadline"), { status: 504 }); });
      const garbage = await extractEvidence(assessor, async () => ({ text: "<html>not json</html>" }));
      return [
        failed.model.status === "failed" && same(failed.signals.map(({ kind, value }) => [kind, value]), extractEvidenceSignals(assessor).map(({ kind, value }) => [kind, value])) ? "" : "timeout must leave parser signals",
        garbage.model.status === "failed" && garbage.signals.length === extractEvidenceSignals(assessor).length ? "" : "malformed reply must leave parser signals",
      ].filter(Boolean);
    }));
    results.push(await attemptAsync("merge: without a model key the result is exactly the parser output", async () => {
      const key = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      try {
        const result = await extractEvidence(assessor);
        return [result.model.status === "not_configured" ? "" : `status ${result.model.status}`, same(result.signals.map(({ kind, value, quote }) => ({ kind, value, quote })), extractEvidenceSignals(assessor)) ? "" : "signals differ from parser"].filter(Boolean);
      } finally {
        if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key;
      }
    }));
    return results;
  },
};
