import { BROKER_UPDATE_SEPARATOR, parseBrokerNotes, type Extracted } from "../../src/agent/analysis";
import { extractNotes } from "../../src/agent/model";
import { same, sleep, type CaseResult, type RunOptions, type Suite } from "../runner";

/**
 * Golden broker notes. `expected` is what a careful underwriter would take from
 * the text: only facts that are explicitly stated, and null whenever the note
 * does not establish the three-year loss count or original construction year.
 * A null that comes back as a number is a hallucination and is the worst
 * failure mode for this agent, so it is tracked as its own metric.
 */
type Case = { name: string; notes: string; expected: Extracted; note?: string };

const update = (first: string, second: string) => `${first}${BROKER_UPDATE_SEPARATOR}${second}`;

export const extractionCases: Case[] = [
  { name: "plain construction sentence with no losses", notes: "Commercial property submission for Hudson Square Offices in New York. The office building was constructed in 2012, is fully sprinklered, and has had no losses in the past three years.", expected: { yearBuilt: 2012, losses: 0 } },
  { name: "labelled year built and claims count", notes: "Year built: 1998. Claims in the past three years: 1. Sprinklered warehouse with a monitored alarm.", expected: { yearBuilt: 1998, losses: 1 } },
  { name: "loss count written as a word", notes: "Constructed in 2003. Two claims were reported in the last three years, both closed.", expected: { yearBuilt: 2003, losses: 2 } },
  { name: "renovation years are not the construction year", notes: "Originally built in 1988. The roof was replaced in 2019 and the sprinkler system was upgraded in 2022. No claims in the past three years.", expected: { yearBuilt: 1988, losses: 0 }, note: "Roof and sprinkler dates must not overwrite the original construction year." },
  { name: "dollar loss total is not a claim count", notes: "Loss history: $120,000 in paid losses over the past five years. Built in 2001.", expected: { yearBuilt: 2001, losses: null }, note: "A dollar total says nothing about how many claims occurred in three years." },
  { name: "count with a dollar detail alongside", notes: "Three claims totaling $45,000 in the past three years. Constructed 2010.", expected: { yearBuilt: 2010, losses: 3 } },
  { name: "broker update supersedes the original note", notes: update("Initial broker note: The property was built in 1972 and had 4 losses in the past three years.", "Correction from the broker: The property was constructed in 2004. There was one loss in the past three years. The earlier construction year and loss count were entered for a different location."), expected: { yearBuilt: 2004, losses: 1 }, note: "The singular 'one loss' in the correction must supersede the earlier count of 4." },
  { name: "singular claim with a digit", notes: "Built in 2015. 1 claim in the past three years (water damage, closed).", expected: { yearBuilt: 2015, losses: 1 }, note: "Singular 'claim' and 'loss' are common in broker notes." },
  { name: "losses none", notes: "Constructed in 2007. Losses: none.", expected: { yearBuilt: 2007, losses: 0 } },
  { name: "loss-free phrasing", notes: "Built in 2011 and loss-free for the past three years.", expected: { yearBuilt: 2011, losses: 0 } },
  { name: "nothing supplied yet", notes: "Commercial property submission for Canal Street Kitchen in New York. The restaurant occupies a single leased building. The broker has not yet supplied the construction year or recent loss history.", expected: { yearBuilt: null, losses: null } },
  { name: "decade only is not a year", notes: "Built in the 1980s; exact year unknown. No claims.", expected: { yearBuilt: null, losses: 0 }, note: "A decade is not a construction year; the guideline needs the exact year." },
  { name: "retrofit code year is not the construction year", notes: "Constructed in 1996 and retrofitted to 2015 seismic code. No losses in the past three years.", expected: { yearBuilt: 1996, losses: 0 } },
  { name: "five-year count does not establish the three-year count", notes: "Built in 2005. Four losses in the past five years.", expected: { yearBuilt: 2005, losses: null }, note: "The demo rule is a three-year count; a five-year count is only an upper bound, so the broker must be asked." },
  { name: "claims history label and year of construction label", notes: "Claims history: 2 in the last three years. Year of construction: 1994.", expected: { yearBuilt: 1994, losses: 2 } },
  { name: "building count is not a claim count", notes: "The insured operates 3 buildings constructed in 2016. No claims in the past three years.", expected: { yearBuilt: 2016, losses: 0 } },
  { name: "loss count before the year", notes: "Losses in the past three years: 0. Built in 2009.", expected: { yearBuilt: 2009, losses: 0 } },
  { name: "several buildings use the oldest construction year", notes: "The campus has two buildings: one built in 1975 and one built in 2018. No losses in the past three years.", expected: { yearBuilt: 1975, losses: 0 }, note: "Guidelines assess the oldest building; taking the last year mentioned hides a pre-1980 exposure." },
  { name: "correction inside a single note", notes: "Built in 1998. Initial note: 3 claims. Broker update: claims in the past three years: 0.", expected: { yearBuilt: 1998, losses: 0 } },
  { name: "loss run summary with a total", notes: "Loss runs (3 years): 2024 water damage; 2025 fire. Total 2 claims. Built 2002.", expected: { yearBuilt: 2002, losses: 2 } },
  { name: "zero written as a word", notes: "Constructed in 2019 with zero claims reported.", expected: { yearBuilt: 2019, losses: 0 } },
  { name: "street number is not a year", notes: "Located at 2010 Main Street. Built in 1965. Claims: 1.", expected: { yearBuilt: 1965, losses: 1 } },
  { name: "hyphenated labels", notes: "Year built - 2008; losses - 1 (past three years).", expected: { yearBuilt: 2008, losses: 1 } },
  { name: "empty note", notes: "", expected: { yearBuilt: null, losses: null } },
  { name: "future year is not a construction year", notes: "Construction scheduled to complete in 2027; the building is not yet built. No claims.", expected: { yearBuilt: null, losses: 0 }, note: "A building that does not exist yet has no construction year to check." },
  { name: "deductible per claim is not a count", notes: "Deductible of $5,000 per claim. No losses in the past three years. Built in 2013.", expected: { yearBuilt: 2013, losses: 0 } },
  { name: "one-year count does not establish the three-year count", notes: "There were 2 claims in the past year. Constructed in 2006.", expected: { yearBuilt: 2006, losses: null }, note: "A twelve-month count is only a lower bound for three years." },
  { name: "zero over a longer window is still zero", notes: "No losses in the past five years. Built in 2000.", expected: { yearBuilt: 2000, losses: 0 }, note: "Zero claims in five years implies zero in three." },
  { name: "count of carriers is not a count of claims", notes: "Two prior carriers, no claims. Built in 2016.", expected: { yearBuilt: 2016, losses: 0 } },
  { name: "updated systems do not correct the construction year", notes: "Year built 1965; updated electrical in 2015. Claims: 0.", expected: { yearBuilt: 1965, losses: 0 } },
  { name: "claim reference number is not a count", notes: "Claim 2024-001 was closed without payment. Built in 2010.", expected: { yearBuilt: 2010, losses: null }, note: "One claim is mentioned but its window is not stated, so the count stays unknown." },
];

async function extractWith(options: RunOptions, notes: string): Promise<Extracted | null> {
  if (options.extractor === "parser") return parseBrokerNotes(notes);
  const result = await extractNotes(notes);
  if (options.extractor === "pipeline") return result.extracted;
  const source = options.extractor === "openai-only" ? "OpenAI" : "Gemini";
  const completed = result.attempts.find((attempt) => attempt.source === source && attempt.status === "completed");
  return completed?.value ?? null;
}

export const extractionSuite: Suite = {
  name: "extraction",
  description: "Broker-note fact extraction: year built and three-year loss count, never invented",
  async run(options) {
    const results: CaseResult[] = [];
    for (const [index, item] of extractionCases.entries()) {
      if (options.extractor !== "parser" && index > 0) await sleep(options.modelDelayMs);
      const actual = await extractWith(options, item.notes);
      const metrics: Record<string, number> = { hallucinated: 0, missed: 0, wrong: 0 };
      if (actual) {
        for (const field of ["yearBuilt", "losses"] as const) {
          if (item.expected[field] === null && actual[field] !== null) metrics.hallucinated++;
          else if (item.expected[field] !== null && actual[field] === null) metrics.missed++;
          else if (actual[field] !== item.expected[field]) metrics.wrong++;
        }
      }
      const passed = actual !== null && same(actual, item.expected);
      results.push({
        name: item.name, passed, note: item.note, metrics,
        detail: passed ? undefined : actual === null ? "model produced no result" : `expected ${JSON.stringify(item.expected)}, got ${JSON.stringify(actual)}`,
      });
      options.log?.(`${passed ? "PASS" : "FAIL"} extraction · ${item.name}`);
    }
    return results;
  },
};
