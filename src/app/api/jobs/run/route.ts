import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { drainJobs } from "@/agent/jobs";
import { captureAgentError } from "@/agent/monitoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Leaves headroom under maxDuration for a job that starts near the end of the budget.
const PING_DRAIN_BUDGET_MS = 240_000;
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Bearer-token check shared by Vercel Cron (which sends CRON_SECRET automatically) and any
 * external pinger such as cron-job.org. Unset secret means the route is closed, never open.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const presented = Buffer.from(header.startsWith("Bearer ") ? header.slice(7).trim() : "");
  const expected = Buffer.from(secret);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

/**
 * Drains the case job queue without a worker process. By default it answers 202 at once and
 * keeps draining after the response, so a pinger with a short timeout never sees a failure;
 * `?wait=1` drains first and reports the count, which is handy when checking a deployment.
 */
async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  const wait = new URL(request.url).searchParams.get("wait") === "1";
  if (wait) {
    try {
      return NextResponse.json(await drainJobs(PING_DRAIN_BUDGET_MS), { headers: NO_STORE });
    } catch (error) {
      captureAgentError(error, { where: "jobs_run" });
      console.error("Job run failed", error instanceof Error ? error.name : "UnknownError");
      return NextResponse.json({ error: "Job run failed. Check the database logs." }, { status: 503, headers: NO_STORE });
    }
  }
  after(async () => {
    try {
      const { processed, drained } = await drainJobs(PING_DRAIN_BUDGET_MS);
      console.info(`[jobs] pinged drain processed ${processed} job(s)${drained ? "" : "; budget spent with work still queued"}`);
    } catch (error) {
      captureAgentError(error, { where: "jobs_run" });
      console.error("Job run failed", error instanceof Error ? error.name : "UnknownError");
    }
  });
  return NextResponse.json({ accepted: true }, { status: 202, headers: NO_STORE });
}

export { run as GET, run as POST };
