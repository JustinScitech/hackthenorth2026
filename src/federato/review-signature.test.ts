import assert from "node:assert/strict";
import test from "node:test";
import type { RankedSubmission } from "./scoring";
import { signReviewItem, verifyReviewItem } from "./review-signature";

test("a triage chat can use only an unchanged recent server review", () => {
  const prior = process.env.BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_SECRET = "test-secret";
  try {
    const item: RankedSubmission = { id: "42", account: "Example", score: 49, rawScore: 86, recommendation: "Refer", explanation: "Renewal outside appetite.", criteria: [], missingData: [] };
    const generatedAt = new Date().toISOString();
    const signature = signReviewItem("Policy", generatedAt, item);
    assert.equal(verifyReviewItem("Policy", generatedAt, item, signature), true);
    assert.equal(verifyReviewItem("Submission", generatedAt, item, signature), false);
    assert.equal(verifyReviewItem("Policy", generatedAt, { ...item, score: 94 }, signature), false);
    assert.equal(verifyReviewItem("Policy", new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), item, signature), false);
  } finally {
    if (prior === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = prior;
  }
});
