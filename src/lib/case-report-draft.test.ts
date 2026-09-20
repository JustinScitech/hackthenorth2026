import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentReportSections } from "./case-report-draft";
import type { AuditEvent, CaseRecord } from "./types";

const record: CaseRecord = {
  id: "11111111-1111-4111-8111-111111111111", insuredName: "Northline Fabrication", state: "CO", tiv: 6_250_000,
  yearBuilt: 2008, losses: 1, sourceKey: "sample", publicSourceUrl: "https://example.org/property",
  publicEvidence: { title: "Property record", url: "https://example.org/property", excerpt: "Built in 2008.", signals: [{ kind: "yearBuilt", value: 2008, quote: "Constructed in 2008." }] },
  extractionConflicts: [], status: "approved", facts: {
    state: { value: "CO", source: "Intake", confidence: 1 }, tiv: { value: 6_250_000, source: "Intake", confidence: 1 },
    yearBuilt: { value: 2008, source: "Broker notes", confidence: 0.9 }, losses: { value: 1, source: "Broker notes", confidence: 0.8 },
  }, findings: [{ id: "year", label: "Building age", result: "pass", detail: "Within appetite.", source: "Broker notes" }],
  brief: "The risk fits the carrier appetite.", question: null, decision: "Approved after review.", error: null,
  appetite: { business: "new", line: "property", premium: 90_000, constructionPercent: 75, lossValue: 20_000, lossHistoryComplete: true, effective: "2026-10-01", expiration: "2027-10-01" },
  appetiteResult: { id: "northline", account: "Northline Fabrication", score: 82, rawScore: 82, recommendation: "Review for acceptance", explanation: "Evidence supports review.", missingData: [], criteria: [{ concept: "state", factor: "Primary risk state", status: "target", points: 15, maximum: 15, detail: "Colorado is a target state.", source: "Intake" }] },
  analysisRevision: 1, reportDraft: null, reportDraftVersion: 0,
  createdAt: "2026-09-20T15:00:00Z", updatedAt: "2026-09-20T15:00:00Z",
};
const audit: AuditEvent[] = [{ id: "1", eventType: "analysis_completed", detail: { pass: 1, status: "approved" }, createdAt: "2026-09-20T15:00:00Z" }];

test("editable report starts with the complete visible case analysis and provenance", () => {
  const sections = buildAgentReportSections(record, audit);
  const body = sections.map((section) => `${section.title}\n${section.body}`).join("\n");
  for (const phrase of ["The risk fits the carrier appetite", "82/100", "Primary risk state", "Broker notes", "Constructed in 2008", "Approved after review", "Analysis Completed"]) {
    assert.ok(body.includes(phrase), `Report is missing ${phrase}`);
  }
  assert.equal(new Set(sections.map((section) => section.id)).size, sections.length);
});
