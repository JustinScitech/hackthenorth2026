import { BROKER_UPDATE_SEPARATOR } from "../../src/agent/analysis";
import { loadAgentEvaluationCases } from "../../src/agent/evaluation";
import { EXTRACTION_FIELDS, parserReading, quoteInText, readingQuotes, readingValues, type ExtractedFields, type ExtractionField } from "../../src/agent/extraction-schema";
import { extractNotes } from "../../src/agent/model";
import { sleep, type CaseResult, type RunOptions, type Suite } from "../runner";

/**
 * Golden broker notes. `expected` is what a careful underwriter would take from
 * the text across the whole fact schema: the construction year, the three-year
 * claim count, and every carrier appetite field, each null whenever the note
 * does not establish it. A null that comes back as a value is a hallucination
 * and is the worst failure mode for this agent, so it is tracked as its own
 * metric, per field. Every quote a reader gives must be a verbatim substring of
 * the note; `quotes` pins the exact sentence or line the parser must cite.
 */
type Quotes = Partial<Record<ExtractionField, string>>;
type Case = { name: string; notes: string; expected: ExtractedFields; quotes?: Quotes; note?: string };

const update = (first: string, second: string) => `${first}${BROKER_UPDATE_SEPARATOR}${second}`;
/** Only the stated fields; everything else the note does not establish. */
export const facts = (stated: Partial<ExtractedFields>): ExtractedFields => ({ yearBuilt: null, losses: null, business: null, line: null, premium: null, constructionPercent: null, lossValue: null, lossHistoryComplete: null, effective: null, expiration: null, ...stated });

export const extractionCases: Case[] = [
  { name: "plain construction sentence with no losses", notes: "Commercial property submission for Hudson Square Offices in New York. The office building was constructed in 2012, is fully sprinklered, and has had no losses in the past three years.", expected: facts({ yearBuilt: 2012, losses: 0 }), quotes: { yearBuilt: "The office building was constructed in 2012, is fully sprinklered, and has had no losses in the past three years.", losses: "The office building was constructed in 2012, is fully sprinklered, and has had no losses in the past three years." } },
  { name: "labelled year built and claims count", notes: "Year built: 1998. Claims in the past three years: 1. Sprinklered warehouse with a monitored alarm.", expected: facts({ yearBuilt: 1998, losses: 1 }), quotes: { yearBuilt: "Year built: 1998.", losses: "Claims in the past three years: 1." } },
  { name: "loss count written as a word", notes: "Constructed in 2003. Two claims were reported in the last three years, both closed.", expected: facts({ yearBuilt: 2003, losses: 2 }), quotes: { losses: "Two claims were reported in the last three years, both closed." } },
  { name: "renovation years are not the construction year", notes: "Originally built in 1988. The roof was replaced in 2019 and the sprinkler system was upgraded in 2022. No claims in the past three years.", expected: facts({ yearBuilt: 1988, losses: 0 }), quotes: { yearBuilt: "Originally built in 1988." }, note: "Roof and sprinkler dates must not overwrite the original construction year." },
  { name: "dollar loss total is not a claim count", notes: "Loss history: $120,000 in paid losses over the past five years. Built in 2001.", expected: facts({ yearBuilt: 2001, losses: null, lossValue: 120_000 }), note: "A dollar total says nothing about how many claims occurred in three years; it is the five-year loss value, which only a model reads from prose." },
  { name: "count with a dollar detail alongside", notes: "Three claims totaling $45,000 in the past three years. Constructed 2010.", expected: facts({ yearBuilt: 2010, losses: 3 }) },
  { name: "broker update supersedes the original note", notes: update("Initial broker note: The property was built in 1972 and had 4 losses in the past three years.", "Correction from the broker: The property was constructed in 2004. There was one loss in the past three years. The earlier construction year and loss count were entered for a different location."), expected: facts({ yearBuilt: 2004, losses: 1 }), quotes: { yearBuilt: "Correction from the broker: The property was constructed in 2004.", losses: "There was one loss in the past three years." }, note: "The singular 'one loss' in the correction must supersede the earlier count of 4." },
  { name: "singular claim with a digit", notes: "Built in 2015. 1 claim in the past three years (water damage, closed).", expected: facts({ yearBuilt: 2015, losses: 1 }), note: "Singular 'claim' and 'loss' are common in broker notes." },
  { name: "losses none", notes: "Constructed in 2007. Losses: none.", expected: facts({ yearBuilt: 2007, losses: 0 }), quotes: { yearBuilt: "Constructed in 2007.", losses: "Losses: none." } },
  { name: "loss-free phrasing", notes: "Built in 2011 and loss-free for the past three years.", expected: facts({ yearBuilt: 2011, losses: 0 }) },
  { name: "nothing supplied yet", notes: "Commercial property submission for Canal Street Kitchen in New York. The restaurant occupies a single leased building. The broker has not yet supplied the construction year or recent loss history.", expected: facts({}) },
  { name: "decade only is not a year", notes: "Built in the 1980s; exact year unknown. No claims.", expected: facts({ yearBuilt: null, losses: 0 }), note: "A decade is not a construction year; the guideline needs the exact year." },
  { name: "retrofit code year is not the construction year", notes: "Constructed in 1996 and retrofitted to 2015 seismic code. No losses in the past three years.", expected: facts({ yearBuilt: 1996, losses: 0 }) },
  { name: "five-year count does not establish the three-year count", notes: "Built in 2005. Four losses in the past five years.", expected: facts({ yearBuilt: 2005, losses: null }), note: "The demo rule is a three-year count; a five-year count is only an upper bound, so the broker must be asked." },
  { name: "claims history label and year of construction label", notes: "Claims history: 2 in the last three years. Year of construction: 1994.", expected: facts({ yearBuilt: 1994, losses: 2 }) },
  { name: "building count is not a claim count", notes: "The insured operates 3 buildings constructed in 2016. No claims in the past three years.", expected: facts({ yearBuilt: 2016, losses: 0 }) },
  { name: "loss count before the year", notes: "Losses in the past three years: 0. Built in 2009.", expected: facts({ yearBuilt: 2009, losses: 0 }) },
  { name: "several buildings use the oldest construction year", notes: "The campus has two buildings: one built in 1975 and one built in 2018. No losses in the past three years.", expected: facts({ yearBuilt: 1975, losses: 0 }), note: "Guidelines assess the oldest building; taking the last year mentioned hides a pre-1980 exposure." },
  { name: "correction inside a single note", notes: "Built in 1998. Initial note: 3 claims. Broker update: claims in the past three years: 0.", expected: facts({ yearBuilt: 1998, losses: 0 }) },
  { name: "loss run summary with a total", notes: "Loss runs (3 years): 2024 water damage; 2025 fire. Total 2 claims. Built 2002.", expected: facts({ yearBuilt: 2002, losses: 2 }), quotes: { losses: "Total 2 claims." } },
  { name: "zero written as a word", notes: "Constructed in 2019 with zero claims reported.", expected: facts({ yearBuilt: 2019, losses: 0 }) },
  { name: "street number is not a year", notes: "Located at 2010 Main Street. Built in 1965. Claims: 1.", expected: facts({ yearBuilt: 1965, losses: 1 }) },
  { name: "hyphenated labels", notes: "Year built - 2008; losses - 1 (past three years).", expected: facts({ yearBuilt: 2008, losses: 1 }) },
  { name: "empty note", notes: "", expected: facts({}) },
  { name: "future year is not a construction year", notes: "Construction scheduled to complete in 2027; the building is not yet built. No claims.", expected: facts({ yearBuilt: null, losses: 0 }), note: "A building that does not exist yet has no construction year to check." },
  { name: "deductible per claim is not a count", notes: "Deductible of $5,000 per claim. No losses in the past three years. Built in 2013.", expected: facts({ yearBuilt: 2013, losses: 0 }) },
  { name: "one-year count does not establish the three-year count", notes: "There were 2 claims in the past year. Constructed in 2006.", expected: facts({ yearBuilt: 2006, losses: null }), note: "A twelve-month count is only a lower bound for three years." },
  { name: "zero over a longer window is still zero", notes: "No losses in the past five years. Built in 2000.", expected: facts({ yearBuilt: 2000, losses: 0 }), note: "Zero claims in five years implies zero in three." },
  { name: "count of carriers is not a count of claims", notes: "Two prior carriers, no claims. Built in 2016.", expected: facts({ yearBuilt: 2016, losses: 0 }) },
  { name: "updated systems do not correct the construction year", notes: "Year built 1965; updated electrical in 2015. Claims: 0.", expected: facts({ yearBuilt: 1965, losses: 0 }) },
  { name: "claim reference number is not a count", notes: "Claim 2024-001 was closed without payment. Built in 2010.", expected: facts({ yearBuilt: 2010, losses: null }), note: "One claim is mentioned but its window is not stated, so the count stays unknown." },
  // The carrier appetite fields, stated the way the broker is asked to state them.
  { name: "explicit appetite lines beside a construction sentence", notes: "Business type: new\nLine of business: Property\nPremium: $85,000\nEligible construction percent: 75%\nFive-year loss value: $12,000\nFive-year history complete: yes\nEffective date: 2026-01-01\nExpiration date: 2027-01-01\nThe warehouse was constructed in 2005. No losses in the past three years.", expected: facts({ yearBuilt: 2005, losses: 0, business: "new", line: "property", premium: 85_000, constructionPercent: 75, lossValue: 12_000, lossHistoryComplete: true, effective: "2026-01-01", expiration: "2027-01-01" }), quotes: { premium: "Premium: $85,000", lossValue: "Five-year loss value: $12,000", lossHistoryComplete: "Five-year history complete: yes", effective: "Effective date: 2026-01-01", yearBuilt: "The warehouse was constructed in 2005." } },
  { name: "an unknown premium line stays unknown", notes: "Premium: unknown\nBusiness type: new\nBuilt in 2005.", expected: facts({ yearBuilt: 2005, business: "new" }), note: "'unknown' is an answer that the field is not known, never a value." },
  { name: "renewal with large losses over an incomplete history", notes: "Business type: renewal\nFive-year loss value: $250,000\nFive-year history complete: no\nConstructed in 1999. No claims in the past three years.", expected: facts({ yearBuilt: 1999, losses: 0, business: "renewal", lossValue: 250_000, lossHistoryComplete: false }), quotes: { lossHistoryComplete: "Five-year history complete: no" }, note: "'no' is a stated false, not a missing answer; the dollars stand on their own." },
  { name: "policy dates and line of business on lines", notes: "Effective date: 2026-10-01\nExpiration date: 2027-10-01\nLine of business: property", expected: facts({ line: "property", effective: "2026-10-01", expiration: "2027-10-01" }) },
  { name: "a claim count line is not loss dollars", notes: "Claims in the past three years: 2\nBuilt in 2010.", expected: facts({ yearBuilt: 2010, losses: 2 }), note: "Counts and dollars are different facts; the five-year loss value stays unknown." },
  { name: "construction percent with a percent sign", notes: "Eligible construction percent: 60%\nBuilt in 2001.", expected: facts({ yearBuilt: 2001, constructionPercent: 60 }) },
  { name: "a later reply line supersedes the original premium", notes: update("Premium: $85,000\nBuilt in 2005.", "Premium: $90,000"), expected: facts({ yearBuilt: 2005, premium: 90_000 }), quotes: { premium: "Premium: $90,000" } },
  { name: "an occupancy percentage is not the construction mix", notes: "Occupancy is 80% office. Built in 2011. No claims in the past three years.", expected: facts({ yearBuilt: 2011, losses: 0 }), note: "Only the eligible construction percent counts; any other percentage is a hallucination." },
  { name: "a deductible is neither the premium nor the loss value", notes: "Deductible: $25,000. Built in 2012. Claims: 0.", expected: facts({ yearBuilt: 2012, losses: 0 }) },
  { name: "an incomplete history without dollars keeps the loss value unknown", notes: "Five-year history complete: no\nLoss runs to follow. Built in 2008.", expected: facts({ yearBuilt: 2008, lossHistoryComplete: false }) },
  { name: "appetite lines with an intake-style label the broker was not asked for", notes: "Total insured value: $4,300,000\nBuilt in 2014. No losses in the past three years.", expected: facts({ yearBuilt: 2014, losses: 0 }), note: "Insured value is intake, not an appetite line, and must not land in the premium or loss value." },
  // Prose statements only a model can read; the parser misses these, which the baseline records.
  { name: "premium and business type stated in prose", notes: "This is new business with an annual premium of $85,000. Built in 2005. No losses in the past three years.", expected: facts({ yearBuilt: 2005, losses: 0, business: "new", premium: 85_000 }), note: "The parser only reads 'Field: value' lines; a model should take the stated premium and business type with the sentence as its quote." },
  { name: "shorthand premium and policy dates in a casual reply", notes: "Premium's about 48k and the policy runs Jan 1 to Dec 31 2026. Built in 2009. No claims in the past three years.", expected: facts({ yearBuilt: 2009, losses: 0, premium: 48_000, effective: "2026-01-01", expiration: "2026-12-31" }), note: "Brokers write '48k' and 'Jan 1 to Dec 31 2026'; an approximate or shorthand figure is still the stated premium, and the dates are full calendar dates." },
  { name: "policy dates written out in prose", notes: "The requested effective date is October 1, 2026, with expiration on October 1, 2027. Constructed in 2015. No claims in the past three years.", expected: facts({ yearBuilt: 2015, losses: 0, effective: "2026-10-01", expiration: "2027-10-01" }), note: "A full calendar date in prose is a stated fact; only the format changes." },
  ...loadAgentEvaluationCases().map<Case>((item) => ({ name: `agent notes: ${item.id}`, notes: item.notes, expected: facts(item.expected), note: `Versioned fixture from evals/agent-notes (${item.source.title}).` })),
];

type Actual = { values: ExtractedFields; quotes: Record<ExtractionField, string | null> };

async function extractWith(options: RunOptions, notes: string): Promise<Actual | null> {
  if (options.extractor === "parser") { const reading = parserReading(notes); return { values: readingValues(reading), quotes: readingQuotes(reading) }; }
  const result = await extractNotes(notes);
  if (options.extractor === "pipeline") return { values: result.extracted, quotes: result.quotes };
  const source = options.extractor === "openai-only" ? "OpenAI" : "Gemini";
  const completed = result.attempts.find((attempt) => attempt.source === source && attempt.status === "completed");
  return completed?.reading ? { values: readingValues(completed.reading), quotes: readingQuotes(completed.reading) } : null;
}

/** Per-field scoring: a hallucinated, missed, or wrong value, and a quote that is not in the note or not the one the parser must cite. */
export function scoreExtraction(item: Case, actual: Actual | null, extractor: RunOptions["extractor"]): { metrics: Record<string, number>; problems: string[] } {
  const metrics: Record<string, number> = { hallucinated: 0, missed: 0, wrong: 0, badQuote: 0 };
  const problems: string[] = [];
  if (!actual) return { metrics, problems: ["model produced no result"] };
  const count = (kind: string, field: ExtractionField) => { metrics[kind]++; metrics[`${kind}:${field}`] = (metrics[`${kind}:${field}`] ?? 0) + 1; };
  for (const field of EXTRACTION_FIELDS) {
    const expected = item.expected[field];
    const got = actual.values[field];
    if (expected === null && got !== null) { count("hallucinated", field); problems.push(`${field} hallucinated ${JSON.stringify(got)}`); }
    else if (expected !== null && got === null) { count("missed", field); problems.push(`${field} missed ${JSON.stringify(expected)}`); }
    else if (got !== expected) { count("wrong", field); problems.push(`${field} ${JSON.stringify(got)} expected ${JSON.stringify(expected)}`); }
    const quote = actual.quotes[field];
    if (quote !== null && !quoteInText(quote, item.notes)) { count("badQuote", field); problems.push(`${field} quote "${quote}" is not in the note`); }
    else if (quote !== null && got === null) { count("badQuote", field); problems.push(`${field} has a quote but no value`); }
    else if (extractor === "parser" && item.quotes?.[field] !== undefined && quote !== item.quotes[field]) { count("badQuote", field); problems.push(`${field} quote ${JSON.stringify(quote)} expected ${JSON.stringify(item.quotes[field])}`); }
  }
  return { metrics, problems };
}

export const extractionSuite: Suite = {
  name: "extraction",
  description: "Broker-note fact extraction across the whole schema: year built, three-year loss count, and every appetite field, never invented, each with a verbatim quote",
  async run(options) {
    const results: CaseResult[] = [];
    for (const [index, item] of extractionCases.entries()) {
      if (options.extractor !== "parser" && index > 0) await sleep(options.modelDelayMs);
      const actual = await extractWith(options, item.notes);
      const { metrics, problems } = scoreExtraction(item, actual, options.extractor);
      const passed = problems.length === 0;
      results.push({ name: item.name, passed, note: item.note, metrics, detail: passed ? undefined : problems.join("; ") });
      options.log?.(`${passed ? "PASS" : "FAIL"} extraction · ${item.name}`);
    }
    return results;
  },
};
