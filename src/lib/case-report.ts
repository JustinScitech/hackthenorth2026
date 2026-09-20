import PDFDocument from "pdfkit";
import { summarizeSubmission } from "@/federato/presentation";
import type { AuditEvent, CaseRecord, Fact } from "./types";

export type ReportConversationTurn = { role: "you" | "agent"; text: string; edited?: boolean };

const ink = "#17233B";
const muted = "#59667B";
const accent = "#3458A4";
const rule = "#DCE3EF";
const left = 54;
const width = 504;

function label(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function date(value: string | Date): string {
  return new Date(value).toLocaleString("en-US", {
    timeZone: "UTC", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function auditDetails(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    if (!value.length) return [`${prefix}: None`];
    if (value.every((entry) => entry === null || typeof entry !== "object")) return [`${prefix}: ${value.map(display).join(", ")}`];
    return value.flatMap((entry, index) => auditDetails(entry, `${prefix} ${index + 1}`.trim()));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return prefix ? [`${prefix}: None`] : [];
    return entries.flatMap(([key, entry]) => auditDetails(entry, prefix ? `${prefix} / ${label(key)}` : label(key)));
  }
  return [`${prefix}: ${display(value)}`];
}

export async function createCaseReportPdf(caseRecord: CaseRecord, audit: AuditEvent[], conversation: ReportConversationTurn[] = []): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 54, right: 54, bottom: 68, left: 54 }, bufferPages: true });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  function space(height: number) {
    if (doc.y + height > doc.page.height - 68) doc.addPage();
  }

  function section(title: string) {
    space(55);
    doc.moveDown(1.15);
    doc.font("Helvetica-Bold").fontSize(13).fillColor(ink).text(title, left, doc.y, { width });
    doc.moveDown(0.4);
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(rule).lineWidth(0.8).stroke();
    doc.moveDown(0.7);
  }

  function paragraph(text: string, color = ink) {
    space(28);
    doc.font("Helvetica").fontSize(10).fillColor(color).text(text, left, doc.y, { width, lineGap: 3 });
    doc.moveDown(0.65);
  }

  function row(name: string, value: string, note?: string) {
    const rowWidth = width - 152;
    const valueHeight = doc.font("Helvetica").fontSize(10).heightOfString(value, { width: rowWidth, lineGap: 2 });
    const noteHeight = note ? doc.fontSize(8.5).heightOfString(note, { width: rowWidth, lineGap: 2 }) + 3 : 0;
    const height = Math.max(27, valueHeight + noteHeight + 9);
    space(Math.min(height, doc.page.height - 122));
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(muted).text(name, left, y, { width: 140 });
    doc.font("Helvetica").fontSize(10).fillColor(ink).text(value, left + 152, y, { width: rowWidth, lineGap: 2 });
    if (note) doc.font("Helvetica").fontSize(8.5).fillColor(muted).text(note, left + 152, doc.y + 3, { width: rowWidth, lineGap: 2 });
    doc.y = Math.max(doc.y, y + height);
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(rule).lineWidth(0.4).stroke();
    doc.y += 9;
  }

  function fact(name: string, value: Fact<string> | Fact<number>, format = display) {
    row(name, value.value === null ? "Not provided" : format(value.value), `${value.source} | ${Math.round(value.confidence * 100)}% confidence`);
  }

  function conversationSection() {
    if (!conversation.length) return;
    section("Conversation with the agent");
    paragraph("This conversation is included from the current browser session.", muted);
    for (const turn of conversation) {
      space(38);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(muted).text(turn.role === "you" ? "Reviewer" : turn.edited ? "Underwriting agent - reviewer-edited reply" : "Underwriting agent", left, doc.y, { width });
      doc.moveDown(0.25);
      paragraph(turn.text);
    }
  }

  doc.rect(0, 0, doc.page.width, 14).fill(accent);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(accent).text("ASTRA RISK  /  UNDERWRITING REVIEW", left, 50);
  doc.font("Helvetica-Bold").fontSize(24).fillColor(ink).text(caseRecord.insuredName, left, 76, { width });
  doc.font("Helvetica").fontSize(10).fillColor(muted).text(`Case ${caseRecord.id}  |  ${label(caseRecord.status)}`, left, doc.y + 8, { width });
  doc.fontSize(8.5).text(`Generated ${date(new Date())}`, left, doc.y + 3, { width });
  doc.y += 10;

  const editedSections = caseRecord.reportDraft?.analysisRevision === caseRecord.analysisRevision
    ? caseRecord.reportDraft.sections : null;
  if (editedSections) {
    paragraph(`Reviewer-edited report saved by ${caseRecord.reportDraft!.editedBy} on ${date(caseRecord.reportDraft!.updatedAt)}. Original agent analysis remains in the case record.`, muted);
    for (const part of editedSections) {
      section(part.title);
      for (const line of part.body.split("\n")) {
        if (!line.trim()) { doc.moveDown(0.35); continue; }
        const labeled = /^([^:]{1,40}):\s*(.+)$/.exec(line);
        if (labeled && labeled[2].length < 500) row(labeled[1], labeled[2]);
        else paragraph(line);
      }
    }
    conversationSection();
  } else {
  section("Agent assessment");
  paragraph(caseRecord.brief ?? "The agent has not completed its assessment.");
  if (caseRecord.error) row("Workflow error", caseRecord.error);

  section("Submission");
  row("Insured", caseRecord.insuredName);
  row("Location", `${caseRecord.state} property`);
  row("Total insured value", `$${caseRecord.tiv.toLocaleString("en-US")}`);
  row("Submitted", date(caseRecord.createdAt));
  row("Last updated", date(caseRecord.updatedAt));
  if (caseRecord.yearBuilt !== null) row("Submitted year built", String(caseRecord.yearBuilt));
  if (caseRecord.losses !== null) row("Submitted loss count", String(caseRecord.losses));
  if (caseRecord.appetite) {
    const appetite = caseRecord.appetite;
    row("Submission type", display(appetite.business));
    row("Line of business", display(appetite.line));
    row("Total premium", appetite.premium === null ? "Not provided" : `$${appetite.premium.toLocaleString("en-US")}`);
    row("Eligible construction", appetite.constructionPercent === null ? "Not provided" : `${appetite.constructionPercent}%`);
    row("Five-year loss value", appetite.lossValue === null ? "Not provided" : `$${appetite.lossValue.toLocaleString("en-US")}`);
    row("Five-year history complete", appetite.lossHistoryComplete ? "Yes" : "No");
    row("Effective date", display(appetite.effective));
    row("Expiration date", display(appetite.expiration));
  }

  if (caseRecord.appetiteResult) {
    const result = caseRecord.appetiteResult;
    const summary = summarizeSubmission(result);
    section("Carrier appetite recommendation");
    paragraph(summary.title);
    paragraph(summary.plainExplanation);
    row("Match score", `${result.rawScore}/100`);
    row("Priority score", `${result.score}/100`);
    row("Recommended next step", summary.action);
    if (result.evidenceNote) row("Evidence note", result.evidenceNote);
    if (result.lifecycleStatus) row("Lifecycle status", result.lifecycleStatus);
    if (result.missingData.length) row("Missing information", result.missingData.join(", "));
    paragraph(result.explanation);
    section("Appetite factor breakdown");
    for (const criterion of result.criteria) {
      row(`${criterion.factor} | ${label(criterion.status)}`, `${criterion.points}/${criterion.maximum} points. ${criterion.detail}`, `Source: ${criterion.source}`);
    }
  }

  section("Extracted facts");
  if (caseRecord.facts) {
    fact("State", caseRecord.facts.state);
    fact("Total insured value", caseRecord.facts.tiv, (value) => `$${Number(value).toLocaleString("en-US")}`);
    fact("Year built", caseRecord.facts.yearBuilt);
    fact("Loss count", caseRecord.facts.losses);
    if (caseRecord.facts.appetite) row("Appetite evidence", "Supplied carrier appetite fields", `${caseRecord.facts.appetite.source} | ${Math.round(caseRecord.facts.appetite.confidence * 100)}% confidence`);
  } else paragraph("No facts have been extracted yet.", muted);

  section(caseRecord.appetiteResult ? "Carrier appetite checks" : "Legacy guideline checks");
  if (!caseRecord.appetiteResult && caseRecord.findings?.length) paragraph("These saved findings predate the shared carrier appetite evaluator. Create a new review with complete appetite evidence before relying on them.", muted);
  if (caseRecord.findings?.length) {
    for (const finding of caseRecord.findings) {
      row(`${label(finding.result)} | ${finding.label}`, finding.detail, `Source: ${finding.source}`);
    }
  } else paragraph("No guideline findings are available yet.", muted);

  if (caseRecord.extractionConflicts.length) {
    section("Extraction conflicts");
    for (const conflict of caseRecord.extractionConflicts) paragraph(conflict);
  }

  if (caseRecord.publicEvidence || caseRecord.publicSourceUrl) {
    section("Public source evidence");
    if (caseRecord.publicEvidence) {
      row("Source", caseRecord.publicEvidence.title || caseRecord.publicEvidence.url);
      row("URL", caseRecord.publicEvidence.url);
      paragraph(caseRecord.publicEvidence.excerpt);
      for (const signal of caseRecord.publicEvidence.signals ?? []) {
        row(label(signal.kind), display(signal.value), `Source quote: ${signal.quote}`);
      }
      for (const conflict of caseRecord.publicEvidence.conflicts ?? []) row("Parser/model conflict", conflict);
    } else row("Source URL", caseRecord.publicSourceUrl ?? "Not provided");
    paragraph("External source; verify before relying on it.", muted);
  }

  if (caseRecord.question) {
    section("Broker information requested");
    paragraph(caseRecord.question);
  }

  if (caseRecord.decision) {
    section("Underwriter decision");
    row("Status", label(caseRecord.status));
    paragraph(caseRecord.decision);
  }

  conversationSection();

  section("Activity history");
  if (audit.length) {
    for (const event of audit) {
      space(48);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(ink).text(label(event.eventType), left, doc.y, { width });
      doc.font("Helvetica").fontSize(8.5).fillColor(muted).text(date(event.createdAt), left, doc.y + 2, { width });
      const details = auditDetails(event.detail);
      if (details.length) {
        doc.moveDown(0.35);
        for (const detail of details) paragraph(detail, muted);
      } else doc.moveDown(0.7);
    }
  } else paragraph("No activity has been recorded yet.", muted);
  }

  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index++) {
    doc.switchToPage(index);
    doc.page.margins.bottom = 0;
    const footerY = doc.page.height - 43;
    doc.moveTo(left, footerY - 9).lineTo(left + width, footerY - 9).strokeColor(rule).lineWidth(0.6).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(muted).text("2025 commercial property appetite. Quoting and binding stay with the carrier.", left, footerY, { width: 400, lineBreak: false });
    doc.text(`${index + 1} / ${pages.count}`, left + 440, footerY, { width: 64, align: "right", lineBreak: false });
  }
  doc.end();
  return completed;
}
