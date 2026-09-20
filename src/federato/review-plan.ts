import type { Criterion, RankedSubmission } from "./scoring";

export type ReviewTask = {
  factor: string;
  kind: "exception" | "evidence";
  action: string;
  reason: string;
  source: string | null;
};

const evidenceRequests: Partial<Record<Criterion["concept"], string>> = {
  business: "Confirm new business or renewal from the submission application.",
  line: "Confirm the requested line of business from the application.",
  state: "Confirm the primary risk state against the location schedule.",
  tiv: "Request a complete statement of values covering every building and reconcile the total insured value.",
  premium: "Confirm the total premium and currency from the submission or linked policy.",
  year: "Request year-built evidence for every building; ask the underwriter to clarify any guideline boundary.",
  constructionPercent: "Request construction types for every building and verify the eligible share; exactly 50% requires guideline clarification.",
  lossValue: "Request complete five-year account loss runs with dollar amounts and coverage dates; loss counts alone are insufficient.",
};

export function buildReviewPlan(item: RankedSubmission) {
  const tasks: ReviewTask[] = item.criteria
    .filter((criterion) => criterion.status === "outside" || criterion.status === "unknown")
    .map((criterion) => ({
      factor: criterion.factor,
      kind: criterion.status === "outside" ? "exception" : "evidence",
      action: criterion.status === "outside"
        ? `Verify the evidence for ${criterion.factor.toLowerCase()}; if confirmed, refer the exception to an underwriter. Additional information alone does not waive the rule.`
        : evidenceRequests[criterion.concept] ?? `Request evidence for ${criterion.factor.toLowerCase()}.`,
      reason: criterion.detail,
      source: criterion.source,
    }));
  for (const field of new Set(item.missingData)) {
    if (tasks.some((task) => task.factor === field)) continue;
    tasks.push({ factor: field, kind: "evidence", action: `Confirm ${field} against the original submission.`, reason: "Required submission context is missing or invalid.", source: null });
  }
  tasks.sort((first, second) => Number(second.kind === "exception") - Number(first.kind === "exception"));
  const assessed = item.criteria.filter((criterion) => criterion.status !== "unknown").length;
  const exceptions = tasks.filter((task) => task.kind === "exception").length;
  return { tasks, assessed, total: item.criteria.length, exceptions, gaps: tasks.length - exceptions };
}

export function summarizeQueue(items: RankedSubmission[]) {
  const summary = { ready: 0, incomplete: 0, exceptions: 0, withEvidenceGaps: 0 };
  for (const item of items) {
    const plan = buildReviewPlan(item);
    if (plan.exceptions) summary.exceptions++;
    else if (plan.gaps || !plan.total) summary.incomplete++;
    else summary.ready++;
    if (plan.gaps || !plan.total) summary.withEvidenceGaps++;
  }
  return summary;
}
