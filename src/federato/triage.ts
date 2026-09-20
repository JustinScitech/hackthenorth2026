import { deriveFacts } from "./derive";
import type { DataClient, Query } from "./client";
import { planQuery, readValues, type Mapping, type Plan, type Schema } from "./schema";
import { guidelineVersion, scoreSubmission } from "./scoring";
import type { ReviewProgress } from "../lib/review-stream";

type Trace = { reason: string; query: Query; returned: number; total: number }[];

async function readQueue(client: DataClient, plan: Plan, maxRecords: number, trace: Trace, progress?: (event: ReviewProgress) => void) {
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
    progress?.({ stage: "reading", message: `Reading ${plan.resource} records`, detail: `${offset} of ${total} records read`, current: offset, total });
  }
  return { records, total: total ?? 0, truncated: records.size < (total ?? 0) };
}

export async function runTriage(client: DataClient, options: { resource?: string; mapping?: Mapping; maxRecords?: number; top?: number; asOf?: Date } = {}, progress?: (event: ReviewProgress) => void) {
  const maxRecords = options.maxRecords ?? 1000, top = options.top ?? 20;
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 5000 || !Number.isInteger(top) || top < 1 || top > maxRecords) throw new Error("Invalid triage limits.");
  progress?.({ stage: "discovering", message: "Discovering Federato fields", detail: "Checking the live schema before selecting a resource." });
  const schema = await client.schema();
  const plan = planQuery(schema, options);
  progress?.({ stage: "reading", message: `Reading ${plan.resource} records`, detail: plan.reasoning[0] });
  const discovered = schema as Schema;
  if (discovered[plan.resource].fields?.status) plan.select.status = true;
  if (discovered[plan.resource].fields?.insured?.type === "reference") {
    const insured = plan.select.insured as { $expand?: { select?: Record<string, unknown> } } | undefined;
    if (insured?.$expand?.select && plan.leaves.some((leaf) => leaf.path === "insured.id")) insured.$expand.select.id = true;
  }
  const trace: Trace = [];
  const { records, total, truncated } = await readQueue(client, plan, maxRecords, trace, progress);
  const asOf = options.asOf ?? new Date();
  let policyPlan: Plan | undefined;
  let enrichmentComplete = true;
  const linked = new Map<string, Record<string, unknown>[]>();
  const link = discovered.Policy?.fields?.submission;
  if (plan.resource === "Submission" && records.size && link?.type === "reference" && link.resource === "Submission" && link.cardinality === "one") {
    policyPlan = planQuery(schema, { resource: "Policy" });
    policyPlan.select.submission = { $expand: { select: { id: true } } };
    const insured = policyPlan.select.insured as { $expand?: { select?: Record<string, unknown> } } | undefined;
    if (insured?.$expand?.select && policyPlan.leaves.some((leaf) => leaf.path === "insured.id")) insured.$expand.select.id = true;
    plan.reasoning.push("Submission records lack some appetite evidence. Follow the discovered Policy.submission reference in a second bounded query. Enrich only a unique linked policy with matching insured, line, and effective date; never match by account name or discard unmatched submissions.");
    progress?.({ stage: "enriching", message: "Checking linked policies", detail: "Only verified unique links can supplement submission evidence." });
    const policies = await readQueue(client, policyPlan, maxRecords, trace, progress);
    enrichmentComplete = !policies.truncated;
    for (const policy of policies.records.values()) {
      const id = readValues(policy, "submission.id")[0];
      if (typeof id !== "string" && typeof id !== "number") continue;
      const key = String(id);
      linked.set(key, [...(linked.get(key) ?? []), policy]);
    }
  }
  progress?.({ stage: "scoring", message: "Scoring appetite factors", detail: `Applying the shared eight-factor evaluator to ${records.size} records.` });
  const ranked = [...records.values()].map((row) => {
    let scoringPlan = plan;
    let scoringRow = row;
    let evidenceNote = plan.resource === "Submission" ? "No verified unique linked policy; unavailable appetite evidence remains unknown." : "Policy resource selected explicitly or no Submission resource is available.";
    const policies = linked.get(String(row[plan.id])) ?? [];
    const policy = policies[0];
    if (policyPlan && enrichmentComplete && policies.length === 1) {
      const same = (submissionPath: string | undefined, policyPath: string | undefined) => {
        if (!submissionPath || !policyPath) return false;
        const left = readValues(row, submissionPath)[0], right = readValues(policy, policyPath)[0];
        return left !== null && left !== undefined && right !== null && right !== undefined && String(left) === String(right);
      };
      if (same("insured.id", "insured.id") && same(plan.mapping.line, policyPlan.mapping.line) && same(plan.mapping.effective, policyPlan.mapping.effective)) {
        const mapping: Mapping = { ...plan.mapping };
        for (const [concept, path] of Object.entries(policyPlan.mapping)) {
          if (!mapping[concept as keyof Mapping]) mapping[concept as keyof Mapping] = `__policy.${path}`;
        }
        const derivations = Object.fromEntries(Object.entries(policyPlan.derivations).map(([key, path]) => [key, `__policy.${path}`]));
        scoringPlan = { ...plan, mapping, derivations };
        scoringRow = { ...row, __policy: policy };
        evidenceNote = `Evidence supplemented from uniquely linked Policy ${policy[policyPlan.id]}; insured, line, and effective date match. Five-year account loss completeness is still unverified.`;
      } else evidenceNote = "Linked policy context conflicts or is incomplete; policy evidence was not used.";
    } else if (policies.length > 1) evidenceNote = "Multiple policies link to this submission; ambiguous policy evidence was not used.";
    if (!enrichmentComplete) evidenceNote = "Policy lookup reached its record limit; uniqueness cannot be established, so policy enrichment was not used.";
    const derived = deriveFacts(scoringRow, scoringPlan, asOf);
    const result = scoreSubmission(derived.row, derived.mapping, plan.id, asOf);
    for (const criterion of result.criteria) {
      criterion.source = derived.sources[criterion.concept] ?? criterion.source;
      if (criterion.concept === "lossValue" && criterion.status === "unknown" && derived.lossLowerBound !== null) criterion.detail += ` Observed policy claims total at least $${derived.lossLowerBound.toLocaleString("en-US")}; complete five-year account history is unverified.`;
    }
    return { ...result, evidenceNote, lifecycleStatus: typeof row.status === "string" ? row.status : "unknown" };
  }).sort((a, b) => b.score - a.score || b.rawScore - a.rawScore || a.id.localeCompare(b.id, "en", { numeric: true }));
  progress?.({ stage: "complete", message: "Review ready", detail: `${ranked.length} records ranked for underwriter review.`, current: ranked.length, total });
  return { resource: plan.resource, guidelineVersion, generatedAt: asOf.toISOString(), total, evaluated: ranked.length, truncated, enrichmentComplete, top, schema, mapping: plan.mapping, reasoning: plan.reasoning, trace, ranked, topSubmissions: ranked.slice(0, top) };
}
export type TriageReport = Awaited<ReturnType<typeof runTriage>>;
