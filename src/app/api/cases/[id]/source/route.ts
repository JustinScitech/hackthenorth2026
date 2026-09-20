import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob } from "@/agent/job-queue";
import { selectSource } from "@/agent/source-discovery";
import { getAuthorizedSession } from "@/lib/auth-access";
import { db, getCase } from "@/lib/db";
import { drainJobsAfterResponse } from "@/lib/inline-jobs";

// Long enough for the after() drain to finish the research job on Vercel; see lib/inline-jobs.ts.
export const maxDuration = 300;

const bodySchema = z.object({ url: z.string().trim().min(8).max(2000) });

/**
 * The underwriter confirms the public source for a case that arrived without
 * one: a discovered candidate or a URL they typed. The URL passes the same
 * guard as every fetched page, is recorded once (a case has one source), and a
 * `research` job fetches it and re-runs the checks with its evidence.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedSession(request.headers);
  if (!session) return NextResponse.json({ error: "Sign in to access this workspace." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "Use the case page on this site." }, { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid case ID." }, { status: 400 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide the source URL to confirm." }, { status: 400 });

  try {
    const caseRecord = await getCase(id);
    if (!caseRecord) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    let selected: ReturnType<typeof selectSource>;
    try { selected = selectSource(caseRecord.sourceCandidates, parsed.data.url); }
    catch { return NextResponse.json({ error: "Provide a public HTTPS source URL." }, { status: 400 }); }
    if (caseRecord.publicSourceUrl) return NextResponse.json({ error: "This case already has a public source on file." }, { status: 409 });
    if (!["waiting_for_broker", "review_ready"].includes(caseRecord.status)) {
      return NextResponse.json({ error: caseRecord.status === "failed" ? "This case has failed; start a new review to research a source." : "Wait for the agent to finish before confirming a source." }, { status: 409 });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      // New evidence is a new analysis revision, so the re-check and any report edits are keyed apart from the first pass.
      const updated = await client.query(
        `UPDATE cases SET public_source_url = $2, analysis_revision = analysis_revision + 1, updated_at = now()
         WHERE id = $1 AND public_source_url IS NULL AND status IN ('waiting_for_broker', 'review_ready') RETURNING analysis_revision`,
        [id, selected.url],
      );
      if (!updated.rowCount) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "This case has moved to another step. Refresh and try again." }, { status: 409 });
      }
      const revision = Number(updated.rows[0].analysis_revision);
      await client.query(
        "INSERT INTO audit_events (case_id, event_type, event_key, detail) VALUES ($1, 'public_source_confirmed', $2, $3) ON CONFLICT (event_key) DO NOTHING",
        [id, `source-confirmed:${id}:${revision}`, JSON.stringify({
          url: selected.url, confirmedBy: session.user.email, revision,
          candidate: selected.candidate ? { confidence: selected.candidate.confidence, reason: selected.candidate.reason } : null,
        })],
      );
      await enqueueJob(id, "research", `research:${id}:${revision}`, { revision }, 0, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    drainJobsAfterResponse();
    return NextResponse.json({ ok: true, url: selected.url, candidate: selected.candidate }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "The source could not be confirmed. You can retry it." }, { status: 503 });
  }
}
