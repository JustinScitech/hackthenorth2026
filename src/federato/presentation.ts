import type { RankedSubmission } from "./scoring";

export type SubmissionSummary = {
  title: string;
  action: string;
  status: "positive" | "caution" | "refer";
  plainExplanation: string;
  strengths: string[];
  questions: string[];
};

const labels: Record<string, string> = {
  business: "business type", line: "line of business", state: "risk state", tiv: "insured value",
  premium: "premium", year: "building age", constructionPercent: "construction", lossValue: "five-year losses",
};

export function summarizeSubmission(item: RankedSubmission): SubmissionSummary {
  const strengths = item.criteria.filter((criterion) => criterion.status === "target" || criterion.status === "acceptable").map((criterion) => criterion.factor);
  const questions = item.criteria.filter((criterion) => criterion.status === "outside" || criterion.status === "unknown").map((criterion) => criterion.factor);
  const refer = item.criteria.some((criterion) => criterion.status === "outside");
  const incomplete = questions.length > 0 && !refer;
  const action = refer ? "Refer for an appetite exception" : incomplete ? "Ask for the missing information" : "Review for acceptance";
  const status = refer ? "refer" : incomplete ? "caution" : "positive";
  const title = refer ? "Needs an appetite exception" : incomplete ? "Needs more information" : "Good match for review";
  const plainExplanation = refer
    ? `${item.account} does not fit at least one carrier guideline. An underwriter should review the exception before deciding what to do next.`
    : incomplete
      ? `${item.account} has some encouraging signals, but the available submission is incomplete. Confirm the items below before relying on this ranking.`
      : `${item.account} matches the supplied carrier guidelines on the available information. It is ready for an underwriter's review.`;
  return { title, action, status, plainExplanation, strengths, questions };
}

export function buildSummaryMarkdown(report: { generatedAt: string; evaluated: number; total: number; topSubmissions: RankedSubmission[] }): string {
  const lines = ["# Underwriting queue summary", "", `Generated: ${new Date(report.generatedAt).toLocaleString()}`, `Records reviewed: ${report.evaluated} of ${report.total}`, "", "This is a review aid. It does not approve, bind, or decline coverage.", ""];
  for (const [index, item] of report.topSubmissions.entries()) {
    const summary = summarizeSubmission(item);
    lines.push(`## ${index + 1}. ${item.account}`, `**${summary.title}** · Score ${item.score}/100`, "", summary.plainExplanation, "", `**Recommended next step:** ${summary.action}`);
    if (summary.strengths.length) lines.push("", `**What supports this:** ${summary.strengths.join(", ")}.`);
    if (summary.questions.length) lines.push("", `**What to check:** ${summary.questions.join(", ")}.`);
    lines.push("");
  }
  return lines.join("\n");
}
