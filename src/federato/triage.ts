import { deriveFacts } from "./derive";
import type { DataClient, Query } from "./client";
import { planQuery, type Mapping } from "./schema";
import { guidelineVersion, scoreSubmission } from "./scoring";

export async function runTriage(client: DataClient, options: { resource?: string; mapping?: Mapping; maxRecords?: number; top?: number; asOf?: Date } = {}) {
  const maxRecords = options.maxRecords ?? 1000, top = options.top ?? 20;
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 5000 || !Number.isInteger(top) || top < 1 || top > maxRecords) throw new Error("Invalid triage limits.");
  const schema = await client.schema();
  const plan = planQuery(schema, options);
  const trace: { reason: string; query: Query; returned: number; total: number }[] = [];
  const records = new Map<string, Record<string, unknown>>();
  let offset = 0, total: number | undefined;
  while (total === undefined || offset < total) {
    if (offset >= maxRecords) break;
    const query = { resource: plan.resource, select: plan.select, sort: [{ field: plan.id, direction: "asc" }], pagination: { limit: Math.min(50, maxRecords - offset), offset } } satisfies Query;
    const page = await client.query(query);
    trace.push({ reason: offset === 0 ? "Fetch all candidates with the discovered fields; do not discard incomplete submissions." : `The API reports ${page.total} candidates; fetch the next page before ranking the queue.`, query, returned: page.rows.length, total: page.total });
    if (total !== undefined && total !== page.total) throw new Error("Federato queue changed during pagination. Rerun triage for a consistent ranking.");
    total = page.total;
    if (page.rows.length > query.pagination.limit || offset + page.rows.length > total) throw new Error("Federato returned inconsistent pagination metadata.");
    if (!page.rows.length && offset < total) throw new Error("Federato returned an empty page before all submissions were read.");
    for (const row of page.rows) {
      const id = row[plan.id];
      if (!(typeof id === "string" && id.length || typeof id === "number" && Number.isFinite(id))) throw new Error("Federato returned a submission without a valid id.");
      if (records.has(String(id))) throw new Error("Federato repeated a submission across pages. Rerun triage; ranking a duplicated queue would be misleading.");
      records.set(String(id), row);
    }
    offset += page.rows.length;
  }
  const asOf = options.asOf ?? new Date();
  const ranked = [...records.values()].map((row) => {
    const derived = deriveFacts(row, plan, asOf);
    const result = scoreSubmission(derived.row, derived.mapping, plan.id, asOf);
    for (const criterion of result.criteria) {
      criterion.source = derived.sources[criterion.concept] ?? criterion.source;
      if (criterion.concept === "lossValue" && criterion.status === "unknown" && derived.lossLowerBound !== null) criterion.detail += ` Observed policy claims total at least $${derived.lossLowerBound.toLocaleString("en-US")}; complete five-year account history is unverified.`;
    }
    return result;
  }).sort((a, b) => b.score - a.score || b.rawScore - a.rawScore || a.id.localeCompare(b.id, "en", { numeric: true }));
  return { resource: plan.resource, guidelineVersion, generatedAt: asOf.toISOString(), total: total ?? 0, evaluated: ranked.length, truncated: ranked.length < (total ?? 0), top, schema, mapping: plan.mapping, reasoning: plan.reasoning, trace, ranked, topSubmissions: ranked.slice(0, top) };
}
export type TriageReport = Awaited<ReturnType<typeof runTriage>>;
