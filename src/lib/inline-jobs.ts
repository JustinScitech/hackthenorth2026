import { after } from "next/server";
import { drainJobs } from "@/agent/jobs";
import { captureAgentError } from "@/agent/monitoring";
import { inlineJobsEnabled } from "./env";

/**
 * How long a route may keep draining after its response is sent. Vercel Hobby allows 300 s per
 * invocation (see `maxDuration` on the routes); the loop only checks the clock between jobs,
 * so this leaves room for one long extraction to finish before the platform stops the function.
 */
export const INLINE_DRAIN_BUDGET_MS = 180_000;

/**
 * Schedules a queue drain to run once the current response has been sent. Route handlers call
 * this right after enqueueing so a deployment without `npm run worker` still processes cases.
 * A no-op unless lib/env.ts says inline jobs are on, so local runs keep using the worker.
 */
export function drainJobsAfterResponse() {
  if (!inlineJobsEnabled()) return;
  after(async () => {
    try {
      const { processed, drained } = await drainJobs(INLINE_DRAIN_BUDGET_MS);
      if (processed || !drained) console.info(`[jobs] inline drain processed ${processed} job(s)${drained ? "" : "; budget spent with work still queued"}`);
    } catch (error) {
      captureAgentError(error, { where: "inline_drain" });
      console.error("Inline job drain failed", error instanceof Error ? error.name : "UnknownError");
    }
  });
}
