import type { DataClient, Query } from "../../src/federato/client";
import { runTriage } from "../../src/federato/triage";
import { buildSummaryMarkdown, summarizeSubmission } from "../../src/federato/presentation";
import type { CaseResult, Suite } from "../runner";

/**
 * Queue ranking over a synthetic 60-record Federato resource that needs two
 * pages. The expectations are ordering invariants an underwriter relies on:
 * verified matches first, then incomplete records, then exceptions; every
 * record evaluated; stable order on reruns; and the human summary agreeing
 * with the score.
 */
const fields = {
  id: { type: "number" }, account_name: { type: "string" }, primary_risk_state: { type: "string" }, business_type: { type: "string" }, line_of_business: { type: "string" },
  tiv: { type: "number" }, premium: { type: "number" }, year_built: { type: "number" }, acceptable_construction_percent: { type: "number" }, five_year_loss_value: { type: "number" }, effective_date: { type: "string" }, expiration_date: { type: "string" },
};
const schema = { Policy: { type: "object", fields } };
const good = { account_name: "Queue property", primary_risk_state: "CA", business_type: "new", line_of_business: "property", tiv: 75_000_000, premium: 85_000, year_built: 2015, acceptable_construction_percent: 75, five_year_loss_value: 0, effective_date: "2026-01-01", expiration_date: "2027-01-01" };

type Bucket = "acceptance" | "investigate" | "refer";
/** Deterministic queue: ids 1-60 cycle through the three buckets so each page mixes them. */
export function buildQueue(): { rows: Record<string, unknown>[]; bucketOf: Map<string, Bucket> } {
  const rows: Record<string, unknown>[] = [];
  const bucketOf = new Map<string, Bucket>();
  for (let id = 1; id <= 60; id++) {
    const bucket: Bucket = id % 3 === 1 ? "acceptance" : id % 3 === 2 ? "investigate" : "refer";
    const variant = Math.floor(id / 3) % 4;
    const row: Record<string, unknown> = { ...good, id, account_name: `Queue property ${id}` };
    if (bucket === "acceptance") Object.assign(row, [{ year_built: 2005 }, { primary_risk_state: "GA" }, { tiv: 20_000_000 }, {}][variant]);
    if (bucket === "investigate") Object.assign(row, [{ premium: null }, { year_built: 1990 }, { acceptable_construction_percent: 50 }, { account_name: "" }][variant]);
    if (bucket === "refer") Object.assign(row, [{ primary_risk_state: "NY" }, { tiv: 200_000_000 }, { year_built: 1980 }, { five_year_loss_value: 250_000 }][variant]);
    rows.push(row);
    bucketOf.set(String(id), bucket);
  }
  return { rows, bucketOf };
}

class FakeClient implements DataClient {
  queries: Query[] = [];
  /** `honorSort: false` mimics an API that pages in its own order, which the ranking must not depend on. */
  constructor(private readonly rows: Record<string, unknown>[], private readonly honorSort = true) {}
  async schema() { return schema; }
  async query(query: Query) {
    this.queries.push(query);
    const ordered = this.honorSort ? [...this.rows].sort((a, b) => Number(a.id) - Number(b.id)) : this.rows;
    const { offset = 0, limit = 50 } = query.pagination ?? {};
    return { rows: ordered.slice(offset, offset + limit), total: ordered.length };
  }
}

export const rankingSuite: Suite = {
  name: "ranking",
  description: "Federato queue ranking: complete pagination, bucket ordering, stable ties, summaries agree with scores",
  async run() {
    const { rows, bucketOf } = buildQueue();
    const asOf = new Date("2026-09-19T00:00:00Z");
    const client = new FakeClient(rows);
    const report = await runTriage(client, { asOf });
    const rerun = await runTriage(new FakeClient([...rows].reverse(), false), { asOf });
    const order = report.ranked.map((item) => item.id);
    const bucketRank: Record<Bucket, number> = { acceptance: 0, investigate: 1, refer: 2 };
    const results: CaseResult[] = [];
    const add = (name: string, ok: boolean, detail?: string, note?: string) => results.push({ name, passed: ok, detail: ok ? undefined : detail, note });

    add("every record is read across two pages", report.evaluated === 60 && report.total === 60 && !report.truncated && client.queries.length === 2, `evaluated ${report.evaluated}/${report.total}, ${client.queries.length} queries, truncated ${report.truncated}`);
    add("each query requests only the planned fields with stable id ordering", client.queries.every((query) => query.sort?.[0]?.field === "id" && query.select && Object.keys(query.select).length === Object.keys(fields).length), JSON.stringify(client.queries[0]?.select));
    add("no record is duplicated or dropped", new Set(order).size === 60, `${new Set(order).size} unique ids`);
    const buckets = order.map((id) => bucketRank[bucketOf.get(id)!]);
    add("verified matches rank above incomplete records above exceptions", buckets.every((rank, index) => index === 0 || rank >= buckets[index - 1]), `first order violation at position ${buckets.findIndex((rank, index) => index > 0 && rank < buckets[index - 1])}`, "An exception must never outrank a verified match, whatever its raw points.");
    add("top 20 are exactly the acceptance-ready records", report.topSubmissions.length === 20 && report.topSubmissions.every((item) => bucketOf.get(item.id) === "acceptance"), report.topSubmissions.map((item) => `${item.id}:${bucketOf.get(item.id)}`).join(","));
    add("scores respect the caps for each bucket", report.ranked.every((item) => bucketOf.get(item.id) === "acceptance" ? item.score >= 70 : bucketOf.get(item.id) === "investigate" ? item.score <= 69 && item.score > 49 : item.score <= 49), report.ranked.filter((item) => bucketOf.get(item.id) === "investigate" && item.score <= 49).map((item) => item.id).join(","), "Investigate-only records must sit strictly between exceptions and verified matches.");
    add("ranking is independent of source order", JSON.stringify(rerun.ranked.map((item) => item.id)) === JSON.stringify(order), "reversed input produced a different order");
    add("ties break by raw points then numeric id", report.ranked.every((item, index) => index === 0 || report.ranked[index - 1].score > item.score || report.ranked[index - 1].rawScore > item.rawScore || (report.ranked[index - 1].rawScore === item.rawScore && Number(report.ranked[index - 1].id) < Number(item.id))), "tie order drifted");
    add("every record explains its score and next step", report.ranked.every((item) => item.explanation.startsWith(`Score ${item.score}/100`) && item.criteria.length === 8 && item.recommendation.length > 0), "an explanation is missing");
    const summariesAgree = report.ranked.every((item) => {
      const summary = summarizeSubmission(item);
      const bucket = bucketOf.get(item.id);
      return bucket === "acceptance" ? summary.status === "positive" : bucket === "investigate" ? summary.status === "caution" : summary.status === "refer";
    });
    add("plain-language summaries agree with the recommendation", summariesAgree, "summary status disagrees with bucket");
    add("the trace explains every page request", report.trace.length === 2 && report.trace.every((step) => step.reason.length > 0 && step.returned > 0), JSON.stringify(report.trace.map((step) => step.returned)));
    const markdown = buildSummaryMarkdown(report);
    add("downloadable summary lists every top record without raw scoring internals", report.topSubmissions.every((item) => markdown.includes(`. ${item.account}`)) && !markdown.includes("rawScore") && !/capped at/.test(markdown) && markdown.includes("does not approve, bind, or decline"), "summary markdown is incomplete or leaks internals");
    return results;
  },
};
