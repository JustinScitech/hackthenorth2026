import assert from "node:assert/strict";
import test from "node:test";
import { buildFacts, evaluateFacts } from "./analysis";
import { evidenceFindings, extractEvidenceSignals } from "./enrichment";

const facts = buildFacts({ state: "CA", tiv: 75000000, yearBuilt: 2015, losses: 0 }, { yearBuilt: 2015, losses: 0 });

test("eligible public construction labels do not create false referrals", () => {
  for (const type of ["Steel Frame", "steel-frame", "Joisted Masonry", "JM", "Non-combustible/steel", "Masonry Non-Combustible"]) {
    const excerpt = `Construction: ${type}.`;
    const findings = evidenceFindings(facts, { url: "https://example.com", title: "Property", excerpt }, extractEvidenceSignals(excerpt));
    const finding = findings.find((item) => item.id === "evidence_constructionType");
    assert.equal(finding?.result, "pass", type);
    assert.match(finding?.detail ?? "", /required mix comes from the full building schedule/);
    assert.ok(finding?.detail.includes(excerpt));
    assert.ok(!finding?.detail.includes("Non-combustible construction reported"));
  }
});

test("wood remains a referral, unfamiliar construction stays unknown, and findings do not change appetite", () => {
  const before = evaluateFacts(facts).appetiteResult;
  for (const [type, expected] of [["Wood Frame", "refer"], ["Experimental composite", "unknown"]]) {
    const excerpt = `Construction: ${type}.`;
    const findings = evidenceFindings(facts, { url: "https://example.com", title: "Property", excerpt }, extractEvidenceSignals(excerpt));
    assert.equal(findings.find((item) => item.id === "evidence_constructionType")?.result, expected);
  }
  assert.deepEqual(evaluateFacts(facts).appetiteResult, before);
});
