import assert from "node:assert/strict";
import test from "node:test";
import { caseBriefing } from "./chat";
import type { CaseRecord } from "../lib/types";

const record: CaseRecord = {
  id: "case-1", insuredName: "Briefing property", state: "NY", tiv: 75_000_000, yearBuilt: 2015, losses: 0,
  sourceKey: "s", publicSourceUrl: null, sourceCandidates: [], origin: null, address: null, publicEvidence: null, propertyContext: null, extractionConflicts: [],
  status: "review_ready", facts: null, findings: null, brief: "Score 49/100.", question: null, decision: null, reportDraft: null, reportDraftVersion: 0,
  error: null, analysisRevision: 0, createdAt: "2026-09-19T00:00:00Z", updatedAt: "2026-09-19T00:00:00Z",
  appetiteResult: {
    id: "case-1", account: "Briefing property", score: 49, rawScore: 79, recommendation: "Refer for appetite exceptions", explanation: "Score 49/100.", missingData: [],
    criteria: [{ concept: "state", factor: "Primary risk state", status: "outside", points: 0, maximum: 15, detail: "Observed NY.", source: "Intake form" }],
    counterfactuals: [{ concept: "state", factor: "Primary risk state", status: "outside", currentValue: "NY", requiredValue: "CA", projectedScore: 94, projectedAction: "Review for acceptance", patch: { state: "CA" }, condition: "Had the primary risk state been CA, CO, FL, GA, MD, NC, OH, PA, SC, UT or VA, it would score 94 and pass.", sentence: "This is outside appetite at 49/100. Had the primary risk state been CA, CO, FL, GA, MD, NC, OH, PA, SC, UT or VA, it would score 94 and pass." }],
  },
};

test("the briefing tells Astra what would change the outcome so it can explain the counterfactual", () => {
  const briefing = caseBriefing(record, []);
  assert.match(briefing, /What would change the outcome \(appetite only; one factor at a time\):\n- This is outside appetite at 49\/100\. Had the primary risk state been CA, CO, FL, GA, MD, NC, OH, PA, SC, UT or VA, it would score 94 and pass\./);
  const without = caseBriefing({ ...record, appetiteResult: { ...record.appetiteResult!, counterfactuals: [] } }, []);
  assert.doesNotMatch(without, /What would change the outcome/);
  assert.doesNotMatch(caseBriefing({ ...record, appetiteResult: null }, []), /What would change the outcome/);
});
