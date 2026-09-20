import { randomUUID } from "node:crypto";
import { caseAppetiteSchema } from "@/lib/case-appetite";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob } from "@/agent/job-queue";
import { publicSourceUrl } from "@/agent/public-source-url";
import { db, listCases } from "@/lib/db";
import { putText } from "@/lib/storage";
import { requireApiSession } from "@/lib/auth-access";
import { drainJobsAfterResponse } from "@/lib/inline-jobs";

// Long enough for the after() drain to finish an extraction on Vercel; see lib/inline-jobs.ts.
export const maxDuration = 300;

const originSchema = z.object({
  system: z.literal("federato"), resource: z.string().trim().min(1).max(40), id: z.string().trim().min(1).max(40),
  rank: z.number().int().positive(), of: z.number().int().positive(), rankedAt: z.iso.datetime(),
  lifecycleStatus: z.string().trim().max(40).optional(), evidenceNote: z.string().trim().max(400).optional(),
});
// State and TIV may still be open when a case starts from the live queue; the agent asks the broker for them.
const createSchema = z.object({
  insuredName: z.string().trim().min(2).max(160),
  state: z.string().trim().toUpperCase().length(2).nullable(),
  tiv: z.number().positive().max(1_000_000_000).nullable(),
  yearBuilt: z.number().int().min(1800).max(new Date().getFullYear()).nullable(),
  losses: z.number().int().min(0).max(1000).nullable(),
  appetite: caseAppetiteSchema.optional(),
  brokerNotes: z.string().trim().min(10).max(20_000),
  publicSourceUrl: z.url().max(2000).nullable(),
  origin: originSchema.optional(),
  address: z.string().trim().min(5).max(200).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const denied = await requireApiSession(request);
    if (denied) return denied;
    return NextResponse.json({ cases: await listCases() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Cases are unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireApiSession(request);
    if (denied) return denied;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not verify your session. Check the web API and database logs." }, { status: 503 });
  }
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "Use the case form on this site." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the submission fields and try again." }, { status: 400 });
  if (parsed.data.publicSourceUrl) {
    try { publicSourceUrl(parsed.data.publicSourceUrl); }
    catch { return NextResponse.json({ error: "Provide a public HTTPS source URL." }, { status: 400 }); }
  }

  const id = randomUUID();
  const sourceKey = `cases/${id}/submission.txt`;
  try {
    await putText(sourceKey, parsed.data.brokerNotes);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO cases (id, insured_name, state, tiv, year_built, losses, source_key, public_source_url, address, appetite, origin) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        [id, parsed.data.insuredName, parsed.data.state, parsed.data.tiv, parsed.data.yearBuilt, parsed.data.losses, sourceKey, parsed.data.publicSourceUrl, parsed.data.address ?? null, parsed.data.appetite ? JSON.stringify(parsed.data.appetite) : null, parsed.data.origin ? JSON.stringify(parsed.data.origin) : null],
      );
      await enqueueJob(id, "analyze", `analyze:${id}:0`, {}, 0, client);
      await client.query(
        "INSERT INTO audit_events (case_id, event_type, event_key, detail) VALUES ($1, 'case_created', $2, $3)",
        [id, `created:${id}`, JSON.stringify({ source: parsed.data.origin ? "federato_queue" : "intake_form", documentStore: "mongodb", ...(parsed.data.origin ? { origin: parsed.data.origin } : {}) })],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    drainJobsAfterResponse();
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not start this case. Check local services and worker." }, { status: 503 });
  }
}
