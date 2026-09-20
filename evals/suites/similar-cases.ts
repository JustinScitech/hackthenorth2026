import { caseMemoryStore } from "../../src/lib/mongo";
import { createMemoryStore, findSimilarCases, indexCaseMemory, isAtlasUri, localEmbedding, memoryText, toCaseMemory, type SimilarCaseDeps, type SimilarCasesResult } from "../../src/agent/similar-cases";
import type { CaseRecord, Finding } from "../../src/lib/types";
import { attemptAsync, sleep, type CaseResult, type Suite } from "../runner";

/**
 * Precedent retrieval: a case's briefing is embedded and its nearest decided
 * neighbours come back with how they ended. These cases run on the deterministic
 * local embedding (the same hashed bag of words the unit tests use), so what is
 * measured is the ranking, the exclusion of the case itself, and the summary
 * line, not Gemini. Atlas Vector Search is exercised only when MONGODB_URI points
 * at Atlas; local MongoDB has no vector index, so that path is the in-app cosine.
 */
type Group = { key: string; state: string; construction: string; decision: "approved" | "declined"; refers: Finding[]; brief: (name: string) => string; rationale: string };

const groups: Group[] = [
  {
    key: "nj-masonry-approved", state: "NJ", construction: "masonry", decision: "approved",
    refers: [],
    brief: (name) => `${name} is a sprinklered masonry office block in Newark with a clean five-year loss run. Territory, insured value, building age and loss count all pass.`,
    rationale: "Approved: masonry, sprinklered, clean losses, well inside appetite.",
  },
  {
    key: "tx-frame-declined", state: "TX", construction: "frame", decision: "declined",
    refers: [
      { id: "losses", label: "Loss history", result: "refer", detail: "Three fire losses in three years exceeds the two-loss guideline", source: "Intake form" },
      { id: "evidence_constructionType", label: "Construction type", result: "refer", detail: "Wood frame construction is outside the preferred construction mix", source: "Public source" },
    ],
    brief: (name) => `${name} is a wood frame warehouse outside Houston with three fire losses in three years. Loss history and frame construction are both referred; the flood zone is AE.`,
    rationale: "Declined: repeated fire losses on unsprinklered frame construction.",
  },
  {
    key: "fl-frame-approved", state: "FL", construction: "frame", decision: "approved",
    refers: [{ id: "evidence_constructionType", label: "Construction type", result: "refer", detail: "Frame construction with a 2019 roof replacement; wind mitigation certificate on file", source: "Public source" }],
    brief: (name) => `${name} is a frame retail strip in Tampa with a 2019 roof replacement and wind mitigation credits. No losses; construction is referred for the roof age only.`,
    rationale: "Approved: frame but recently re-roofed, wind mitigation on file, no losses.",
  },
  {
    key: "ca-tiltup-declined", state: "CA", construction: "tilt-up concrete", decision: "declined",
    refers: [
      { id: "context_wildfire", label: "Wildfire exposure", result: "refer", detail: "Parcel sits in a very high fire hazard severity zone with two brush fires within five miles since 2020", source: "CAL FIRE" },
      { id: "context_seismic", label: "Seismic exposure", result: "refer", detail: "Within 8 km of the Hayward fault; unreinforced tilt-up panels", source: "USGS" },
    ],
    brief: (name) => `${name} is a tilt-up concrete distribution centre in the East Bay hills. Wildfire severity and seismic exposure are both referred; losses are clean.`,
    rationale: "Declined: wildfire and seismic exposure on unretrofitted tilt-up panels.",
  },
];

const names: Record<string, string[]> = {
  "nj-masonry-approved": ["Harbor Office LLC", "Passaic Professional Center", "Ironbound Medical Suites"],
  "tx-frame-declined": ["Gulf Coast Cold Storage", "Katy Freight Depot", "Brazos Timber Supply"],
  "fl-frame-approved": ["Bayshore Retail Partners", "Hillsborough Plaza", "Palm River Shops"],
  "ca-tiltup-declined": ["East Bay Logistics", "Diablo Valley Distribution", "Hayward Crossdock"],
};

type Truth = { state: string; construction: string; decision: string };

function synthetic(group: Group, index: number): { record: CaseRecord; truth: Truth } {
  const name = names[group.key][index];
  const id = `eval-similar-${group.key}-${index + 1}`;
  const tiv = 2_000_000 + index * 1_250_000;
  const yearBuilt = 1985 + index * 7;
  const record: CaseRecord = {
    id, insuredName: name, state: group.state, tiv, yearBuilt, losses: group.key === "tx-frame-declined" ? 3 : 0,
    appetite: { business: "new", line: "property", premium: 12_000 + index * 900, constructionPercent: group.construction === "frame" ? 20 : 90, lossValue: group.key === "tx-frame-declined" ? 240_000 : 0, lossHistoryComplete: true, effective: "2026-10-01", expiration: "2027-10-01" },
    sourceKey: `${id}:source`, publicSourceUrl: null, address: null,
    publicEvidence: { url: `https://assessor.example.gov/${group.state.toLowerCase()}/${index}`, title: "Property record", excerpt: `Construction: ${group.construction}. Year built ${yearBuilt}.`, signals: [{ kind: "constructionType", value: group.construction, quote: `Construction: ${group.construction}` }] },
    propertyContext: null, sourceCandidates: null, origin: null, extractionConflicts: [], status: group.decision,
    facts: {
      state: { value: group.state, source: "Intake form", confidence: 1 }, tiv: { value: tiv, source: "Intake form", confidence: 1 },
      yearBuilt: { value: yearBuilt, source: "Broker text via Parser", confidence: 0.8 }, losses: { value: group.key === "tx-frame-declined" ? 3 : 0, source: "Intake form", confidence: 1 },
    },
    findings: [{ id: "state", label: "Territory", result: "pass", detail: `${group.state} is a written state`, source: "Intake form" }, ...group.refers],
    brief: group.brief(name), question: null, draftEmail: null, draftStatus: null, decision: group.rationale, reportDraft: null, reportDraftVersion: 0, error: null, analysisRevision: 1,
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  };
  return { record, truth: { state: group.state, construction: group.construction, decision: group.decision } };
}

/** Twelve synthetic decided cases in four groups; exported so live checks can embed the same briefs with a real model. */
export const syntheticCases = groups.flatMap((group) => [0, 1, 2].map((index) => synthetic(group, index)));
const corpus = syntheticCases;
const truthOf = new Map(corpus.map((item) => [item.record.id, item.truth]));
const recordOf = new Map(corpus.map((item) => [item.record.id, item.record]));

/** Reads "N similar past cases: A approved, D declined" back into numbers so the line can be checked against the set it describes. */
export function parseSummaryCounts(summary: string | null): { total: number; approved: number; declined: number } | null {
  if (!summary) return null;
  const total = Number(/^(\d+) similar past case/.exec(summary)?.[1]);
  const approved = Number(/(\d+) approved/.exec(summary)?.[1] ?? 0);
  const declined = Number(/(\d+) declined/.exec(summary)?.[1] ?? 0);
  return Number.isFinite(total) ? { total, approved, declined } : null;
}

async function seededDeps(overrides: Partial<SimilarCaseDeps> = {}): Promise<SimilarCaseDeps & { logged: string[] }> {
  const logged: string[] = [];
  const context: SimilarCaseDeps & { logged: string[] } = {
    enabled: () => true, loadCase: async (id) => recordOf.get(id) ?? null, embed: async (text) => localEmbedding(text),
    store: createMemoryStore(), log: (line) => logged.push(line), logged, ...overrides,
  };
  for (const item of corpus) await context.store.upsert(toCaseMemory(item.record, localEmbedding(memoryText(item.record))));
  return context;
}

function countProblems(result: SimilarCasesResult): string[] {
  const counts = parseSummaryCounts(result.summary);
  if (!result.cases.length) return result.summary === null ? [] : [`summary without cases: ${result.summary}`];
  if (!counts) return [`unparseable summary: ${result.summary}`];
  const approved = result.cases.filter((item) => item.status === "approved").length;
  const declined = result.cases.filter((item) => item.status === "declined").length;
  return [
    counts.total === result.cases.length ? "" : `summary says ${counts.total} cases, returned ${result.cases.length}`,
    counts.approved === approved ? "" : `summary says ${counts.approved} approved, returned ${approved}`,
    counts.declined === declined ? "" : `summary says ${counts.declined} declined, returned ${declined}`,
  ].filter(Boolean);
}

export const similarCasesSuite: Suite = {
  name: "similar-cases",
  description: "Precedent retrieval: nearest decided neighbours share state, construction and decision; the summary line describes exactly the returned set",
  async run() {
    const results: CaseResult[] = [];
    const context = await seededDeps();
    for (const item of corpus) {
      const truth = truthOf.get(item.record.id)!;
      results.push(await attemptAsync(`nearest neighbour of ${item.record.insuredName} shares state, construction and decision`, async () => {
        const result = await findSimilarCases(item.record.id, 3, context);
        const nearest = result.cases[0];
        if (!nearest) return ["no neighbours returned"];
        const neighbour = truthOf.get(nearest.caseId);
        if (!neighbour) return [`unknown neighbour ${nearest.caseId}`];
        return [
          result.cases.some((match) => match.caseId === item.record.id) ? "the case appears in its own results" : "",
          neighbour.state === truth.state ? "" : `nearest is in ${neighbour.state}, not ${truth.state}`,
          neighbour.construction === truth.construction ? "" : `nearest is ${neighbour.construction}, not ${truth.construction}`,
          neighbour.decision === truth.decision ? "" : `nearest was ${neighbour.decision}, not ${truth.decision}`,
          nearest.status === neighbour.decision ? "" : "returned status disagrees with the stored decision",
          result.cases.length === 3 ? "" : `expected 3 neighbours, got ${result.cases.length}`,
        ].filter(Boolean);
      }, "An underwriter asking 'have we seen this before?' wants the closest file, not any file from the same state."));
      results.push(await attemptAsync(`summary counts match the returned set for ${item.record.insuredName}`, async () => countProblems(await findSimilarCases(item.record.id, 3, context))));
    }
    results.push(await attemptAsync("both same-group neighbours outrank every other group", async () => {
      const problems: string[] = [];
      for (const item of corpus) {
        const result = await findSimilarCases(item.record.id, 2, context);
        const groupsSeen = result.cases.map((match) => truthOf.get(match.caseId)).map((truth) => `${truth?.state}/${truth?.construction}/${truth?.decision}`);
        const own = `${item.truth.state}/${item.truth.construction}/${item.truth.decision}`;
        if (!groupsSeen.every((seen) => seen === own)) problems.push(`${item.record.insuredName}: top two are ${groupsSeen.join(" and ")}`);
      }
      return problems;
    }));
    results.push(await attemptAsync("the decline citation is copied from stored referred findings, never invented", async () => {
      const query = corpus.find((item) => item.truth.decision === "declined")!;
      const result = await findSimilarCases(query.record.id, 3, context);
      const cited = /cited (.+)\.$/.exec(result.summary ?? "")?.[1];
      if (!cited) return [`no citation in: ${result.summary}`];
      const allowed = new Set(result.cases.filter((match) => match.status === "declined").flatMap((match) => match.refers.map((refer) => refer.label)));
      return cited.split(/, and |, | and /).map((label) => allowed.has(label) ? "" : `cited "${label}" is not a stored referred finding`).filter(Boolean);
    }, "The reason a precedent was declined must come from that file's own findings; a generated reason would be a fabrication."));
    results.push(await attemptAsync("k bounds the set and the summary follows it", async () => {
      const query = corpus[0];
      const problems: string[] = [];
      for (const k of [1, 2, 5]) {
        const result = await findSimilarCases(query.record.id, k, context);
        if (result.cases.length !== Math.min(k, corpus.length - 1)) problems.push(`k=${k} returned ${result.cases.length}`);
        problems.push(...countProblems(result));
      }
      return problems;
    }));
    results.push(await attemptAsync("an empty memory yields no cases and no summary line", async () => {
      const result = await findSimilarCases(corpus[0].record.id, 3, { ...context, store: createMemoryStore() });
      return [result.cases.length === 0 ? "" : "cases from an empty store", result.summary === null ? "" : `summary ${result.summary}`, result.path === "cosine" ? "" : `path ${result.path}`].filter(Boolean);
    }));
    results.push(await attemptAsync("without an embedding key the feature skips silently", async () => {
      const result = await findSimilarCases(corpus[0].record.id, 3, { ...context, enabled: () => false });
      const indexed = await indexCaseMemory(corpus[0].record.id, { ...context, enabled: () => false });
      return [result.path === "skipped" && result.cases.length === 0 && result.summary === null ? "" : `find: ${JSON.stringify(result)}`, indexed.indexed ? "indexing ran without a key" : ""].filter(Boolean);
    }));
    results.push(await attemptAsync("a missing vector index falls back to in-app cosine and says so", async () => {
      const failing = await seededDeps();
      failing.store.vectorSearch = async () => { throw Object.assign(new Error("Unrecognized pipeline stage name: '$vectorSearch'"), { code: 40324 }); };
      const result = await findSimilarCases(corpus[0].record.id, 3, failing);
      return [result.path === "cosine" ? "" : `path ${result.path}`, result.cases.length === 3 ? "" : `${result.cases.length} cases`, failing.logged.some((line) => /cosine/.test(line)) ? "" : "path not logged"].filter(Boolean);
    }));
    if (isAtlasUri(process.env.MONGODB_URI ?? "")) {
      results.push(await attemptAsync("atlas: $vectorSearch over case_memory returns the same neighbours", async () => {
        const store = caseMemoryStore();
        const live = await seededDeps({ store });
        try {
          let result = await findSimilarCases(corpus[0].record.id, 3, live);
          for (let waited = 0; result.path !== "atlas" && waited < 20_000; waited += 2_000) { await sleep(2_000); result = await findSimilarCases(corpus[0].record.id, 3, live); }
          const expected = (await findSimilarCases(corpus[0].record.id, 3, context)).cases.map((match) => match.caseId);
          return [
            result.path === "atlas" ? "" : `path ${result.path}${result.reason ? ` (${result.reason})` : ""}`,
            result.cases.some((match) => match.caseId === corpus[0].record.id) ? "the case appears in its own results" : "",
            result.cases.map((match) => match.caseId).join() === expected.join() ? "" : `atlas ranked ${result.cases.map((match) => match.caseId).join()} vs cosine ${expected.join()}`,
            ...countProblems(result),
          ].filter(Boolean);
        } finally {
          await store.remove(corpus.map((item) => item.record.id));
        }
      }, "Deployed on Atlas, the vector index is the production path; it must rank the same way the in-app fallback does."));
    }
    return results;
  },
};
