import { summarizeSubmission } from "@/federato/presentation";
import type { AuditEvent, CaseRecord, Fact, ReportSection } from "./types";

function title(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function value(item: unknown): string {
  if (item === null || item === undefined || item === "") return "Not provided";
  if (typeof item === "boolean") return item ? "Yes" : "No";
  if (typeof item === "number") return item.toLocaleString("en-US");
  if (typeof item === "string") return item;
  return JSON.stringify(item);
}

function timestamp(date: string): string {
  return new Date(date).toLocaleString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

function fact(name: string, item: Fact<string | number>): string {
  return `${name}: ${value(item.value)}\nSource: ${item.source}; confidence: ${Math.round(item.confidence * 100)}%`;
}

function auditLines(valueToDescribe: unknown, prefix = ""): string[] {
  if (Array.isArray(valueToDescribe)) {
    if (!valueToDescribe.length) return prefix ? [`${prefix}: None`] : [];
    if (valueToDescribe.every((item) => item === null || typeof item !== "object")) return [`${prefix}: ${valueToDescribe.map(value).join(", ")}`];
    return valueToDescribe.flatMap((item, index) => auditLines(item, `${prefix} ${index + 1}`.trim()));
  }
  if (valueToDescribe && typeof valueToDescribe === "object") {
    return Object.entries(valueToDescribe).flatMap(([key, item]) => auditLines(item, prefix ? `${prefix} / ${title(key)}` : title(key)));
  }
  return [`${prefix}: ${value(valueToDescribe)}`];
}

export function buildAgentReportSections(record: CaseRecord, audit: AuditEvent[]): ReportSection[] {
  const sections: ReportSection[] = [];
  const add = (id: string, heading: string, lines: string[]) => sections.push({ id, title: heading, body: lines.join("\n") });

  add("assessment", "Agent assessment", [record.brief ?? "The agent has not completed its assessment.", ...(record.error ? [`Workflow error: ${record.error}`] : [])]);

  const submission = [
    `Insured: ${record.insuredName}`, `Location: ${record.state} property`,
    `Total insured value: ${record.tiv === null ? "pending from the broker" : `$${record.tiv.toLocaleString("en-US")}`}`,
    `Submitted: ${timestamp(record.createdAt)}`, `Last updated: ${timestamp(record.updatedAt)}`,
  ];
  if (record.yearBuilt !== null) submission.push(`Submitted year built: ${record.yearBuilt}`);
  if (record.losses !== null) submission.push(`Submitted loss count: ${record.losses}`);
  if (record.appetite) {
    const appetite = record.appetite;
    submission.push(`Submission type: ${value(appetite.business)}`, `Line of business: ${value(appetite.line)}`,
      `Total premium: ${appetite.premium === null ? "Not provided" : `$${appetite.premium.toLocaleString("en-US")}`}`,
      `Eligible construction: ${appetite.constructionPercent === null ? "Not provided" : `${appetite.constructionPercent}%`}`,
      `Five-year loss value: ${appetite.lossValue === null ? "Not provided" : `$${appetite.lossValue.toLocaleString("en-US")}`}`,
      `Five-year history complete: ${value(appetite.lossHistoryComplete)}`,
      `Effective date: ${value(appetite.effective)}`, `Expiration date: ${value(appetite.expiration)}`);
  }
  add("submission", "Submission", submission);

  if (record.appetiteResult) {
    const result = record.appetiteResult;
    const summary = summarizeSubmission(result);
    add("recommendation", "Carrier appetite recommendation", [
      summary.title, summary.plainExplanation,
      `Match score: ${result.rawScore}/100`, `Priority score: ${result.score}/100`,
      `Recommended next step: ${summary.action}`, result.explanation,
      ...(result.evidenceNote ? [`Evidence note: ${result.evidenceNote}`] : []),
      ...(result.lifecycleStatus ? [`Lifecycle status: ${result.lifecycleStatus}`] : []),
      ...(result.missingData.length ? [`Missing information: ${result.missingData.join(", ")}`] : []),
    ]);
    add("appetite-factors", "Appetite factor breakdown", result.criteria.map((criterion) =>
      `${criterion.factor} - ${title(criterion.status)} (${criterion.points}/${criterion.maximum} points): ${criterion.detail}\nSource: ${criterion.source}`));
  }

  if (record.facts) {
    add("facts", "Extracted facts", [
      fact("State", record.facts.state), fact("Total insured value", record.facts.tiv),
      fact("Year built", record.facts.yearBuilt), fact("Loss count", record.facts.losses),
      ...(record.facts.appetite ? [`Appetite evidence source: ${record.facts.appetite.source}; confidence: ${Math.round(record.facts.appetite.confidence * 100)}%`] : []),
    ]);
  }

  if (record.findings?.length) {
    add("findings", record.appetiteResult ? "Carrier appetite checks" : "Legacy guideline checks", [
      ...(!record.appetiteResult ? ["These findings predate the shared carrier appetite evaluator. Create a new review with complete appetite evidence before relying on them."] : []),
      ...(record.findings ?? []).map((finding) => `${finding.label} - ${title(finding.result)}: ${finding.detail}\nSource: ${finding.source}`),
    ]);
  }
  if ((record.extractionConflicts ?? []).length) add("conflicts", "Extraction conflicts", (record.extractionConflicts ?? []));

  if (record.publicEvidence || record.publicSourceUrl) {
    const evidence = record.publicEvidence;
    add("public-evidence", "Public source evidence", evidence ? [
      `Source: ${evidence.title || evidence.url}`, `URL: ${evidence.url}`, evidence.excerpt,
      ...(evidence.signals ?? []).map((signal) => `${title(signal.kind)}: ${value(signal.value)}\nSource quote: ${signal.quote}`),
      ...(evidence.conflicts ?? []).map((conflict) => `Parser/model conflict: ${conflict}`),
      "External source; verify before relying on it.",
    ] : [`Source URL: ${record.publicSourceUrl}`, "Public source has not been reviewed yet."]);
  }
  if (record.question) add("broker-question", "Broker information requested", [record.question]);
  if (record.decision) add("decision", "Underwriter decision", [`Status: ${title(record.status)}`, record.decision]);

  add("activity", "Activity history", (audit ?? []).length ? (audit ?? []).map((event) => {
    const details = auditLines(event.detail);
    return `${timestamp(event.createdAt)} - ${title(event.eventType)}${details.length ? `\n${details.join("\n")}` : ""}`;
  }) : ["No activity has been recorded yet."]);
  return sections;
}
