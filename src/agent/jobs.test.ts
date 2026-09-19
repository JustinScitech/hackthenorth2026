import assert from "node:assert/strict";
import test from "node:test";
import { drainJobs } from "./jobs";

// The real processor needs PostgreSQL; these use an injected stand-in.
function queue(jobs: number, eachMs = 0) {
  let left = jobs;
  return async () => {
    if (left === 0) return false;
    left -= 1;
    if (eachMs) await new Promise((resolve) => setTimeout(resolve, eachMs));
    return true;
  };
}

test("drainJobs stops with drained=true once the queue reports empty", async () => {
  assert.deepEqual(await drainJobs(10_000, queue(3)), { processed: 3, drained: true });
  assert.deepEqual(await drainJobs(10_000, queue(0)), { processed: 0, drained: true });
});

test("drainJobs stops with drained=false when the budget runs out first", async () => {
  const result = await drainJobs(25, queue(1_000, 10));
  assert.equal(result.drained, false);
  assert.ok(result.processed >= 1 && result.processed < 1_000, `processed ${result.processed}`);
});

test("drainJobs surfaces a processor failure to the caller", async () => {
  await assert.rejects(drainJobs(1_000, async () => { throw new Error("database offline"); }), /database offline/);
});
