import type { RankedSubmission } from "./scoring";

export type SubmissionSummary = {
  title: string;
  action: string;
  status: "positive" | "caution" | "refer";
  plainExplanation: string;
  strengths: string[];
  questions: string[];
};

export const rankingExplanation = "Ordered by priority score (highest first), then underlying match score, then record ID. Appetite exceptions cap priority at 49; missing required data caps it at 69. Match scores show weighted guideline matches; approval is a separate decision.";

export function resourceLabels(resource: string) {
  return resource === "Policy" ? { singular: "Policy", plural: "policies" } : resource === "Submission" ? { singular: "Submission", plural: "submissions" } : { singular: resource, plural: `${resource} records` };
}

export function summarizeSubmission(item: RankedSubmission): SubmissionSummary {
  const strengths = item.criteria.filter((criterion) => criterion.status === "target" || criterion.status === "acceptable").map((criterion) => criterion.factor);
  const exceptions = item.criteria.filter((criterion) => criterion.status === "outside");
  const questions = [...new Set([...item.criteria.filter((criterion) => criterion.status === "outside" || criterion.status === "unknown").map((criterion) => criterion.factor), ...item.missingData])];
  const refer = exceptions.length > 0;
  const incomplete = questions.length > 0 && !refer;
  const action = refer ? `Refer for underwriting review: ${exceptions.map((criterion) => criterion.factor.toLowerCase()).join(", ")} outside appetite.` : incomplete ? "Ask for the missing information" : "Review for acceptance";
  const status = refer ? "refer" : incomplete ? "caution" : "positive";
  const title = refer ? "Outside appetite: underwriting review needed" : incomplete ? "Needs more information" : "Good match for review";
  const plainExplanation = refer
    ? `${item.account} sits outside the carrier guidelines for ${exceptions.map((criterion) => criterion.factor.toLowerCase()).join(", ")}. ${exceptions.map((criterion) => criterion.detail).join(" ")}`
    : incomplete
      ? `${item.account} has some encouraging signals, but the available submission is incomplete. Confirm the items below before relying on this ranking.`
      : `${item.account} matches the supplied carrier guidelines on the available information. It is ready for an underwriter's review.`;
  return { title, action, status, plainExplanation, strengths, questions };
}

export function buildSummaryMarkdown(report: { resource: string; generatedAt: string; evaluated: number; total: number; topSubmissions: RankedSubmission[] }): string {
  const labels = resourceLabels(report.resource);
  const lines = ["# Underwriting queue summary", "", `Generated: ${new Date(report.generatedAt).toLocaleString()}`, `Scope: ${report.resource}; ${report.evaluated} of ${report.total} ${labels.plural} reviewed`, "", "This is a review aid. Approving, declining, and binding stay with the underwriter.", "", rankingExplanation, ""];
  for (const [index, item] of report.topSubmissions.entries()) {
    const summary = summarizeSubmission(item);
    lines.push(`## ${index + 1}. ${item.account} (${labels.singular} ${item.id})`, `**${summary.title}** · Match score ${item.rawScore}/100 · Priority score ${item.score}/100`, "", summary.plainExplanation, "", `**Recommended next step:** ${summary.action}`);
    if (item.evidenceNote) lines.push("", `Evidence: ${item.evidenceNote}`);
    if (item.lifecycleStatus) lines.push("", `Lifecycle status: ${item.lifecycleStatus}`);
    if (summary.strengths.length) lines.push("", `**What supports this:** ${summary.strengths.join(", ")}.`);
    if (summary.questions.length) lines.push("", `**What to check:** ${summary.questions.join(", ")}.`);
    lines.push("");
  }
  return lines.join("\n");
}
