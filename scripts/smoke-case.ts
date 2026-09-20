/**
 * `npm run smoke:case` drives one synthetic case through the real job path with whatever keys
 * are configured, mirroring what the API routes do: create → analyze (extract, discover sources,
 * property context, check, verify, draft, memory) → a freeform broker reply → re-check → decision
 * → similar-cases lookup. It prints the audit trail, the facts and findings after each step, and
 * any job error, then removes everything it wrote. Flags: `--keep` leaves the case on the board;
 * `--drop-key-after-analyze` runs the reply revision without Gemini, the situation a quota blip
 * creates, to show that known facts are carried forward. It uses the database and MongoDB the
 * app is configured for, and one Browserbase session when that key is set.
 */
import { createHash, randomUUID } from "node:crypto";
import { enqueueJob } from "../src/agent/job-queue";
import { processNextJob } from "../src/agent/jobs";
import { findSimilarCases } from "../src/agent/similar-cases";
import { db, getAudit, getCase } from "../src/lib/db";
import { caseMemoryStore } from "../src/lib/mongo";
import { putText } from "../src/lib/storage";

const keep = process.argv.includes("--keep");
/** Drops the Gemini key before the broker reply, so that revision is parser-only: the situation a quota blip creates. */
const dropKey = process.argv.includes("--drop-key-after-analyze");
const id = randomUUID();
const notes = [
  "Harbor Point Logistics LLC runs a 180,000 sq ft distribution warehouse at 2100 Ross Ave, Dallas, TX 75201.",
  "The building was constructed in 1996 and is fully sprinklered with a monitored alarm.",
  "Two claims in the past three years: a 2024 water damage loss of $45,000 and a minor theft.",
  "Premium's about 62k for the year and this is a renewal; the policy runs Jan 1 to Dec 31 2026. Line of business: property.",
  "Five-year loss runs to follow.",
].join(" ");
const reply = "Thanks - five-year losses total $61,500 and that history is complete. Roughly 80% of the schedule is masonry.";

const stamp = () => new Date().toISOString().slice(11, 19);
const log = (line: string) => console.log(`${stamp()} ${line}`);

async function drain(label: string) {
  const started = performance.now();
  let processed = 0;
  while (await processNextJob()) processed += 1;
  log(`${label}: ${processed} job(s) processed in ${Math.round(performance.now() - started)}ms`);
}

async function show(label: string) {
  const record = await getCase(id);
  if (!record) throw new Error("case vanished");
  log(`${label}: status=${record.status} revision=${record.analysisRevision} error=${record.error ?? "-"}`);
  const facts = record.facts;
  if (facts) {
    const f = facts as Record<string, { value: unknown; source: string; confidence: number; quote?: string }>;
    for (const key of ["yearBuilt", "losses"]) console.log(`    ${key.padEnd(12)} ${String(f[key]?.value).padEnd(12)} ${f[key]?.source} (${f[key]?.confidence})`);
    const appetite = facts.appetite as { value?: Record<string, unknown>; fields?: Record<string, { value: unknown; source: string }> } | undefined;
    if (appetite?.fields) for (const [key, fact] of Object.entries(appetite.fields)) console.log(`    ${key.padEnd(12)} ${String(fact.value).padEnd(12)} ${fact.source}`);
    else if (appetite?.value) console.log(`    appetite     ${JSON.stringify(appetite.value)}`);
  }
  console.log(`    conflicts    ${JSON.stringify(record.extractionConflicts)}`);
  console.log(`    candidates   ${(record.sourceCandidates ?? []).map((c) => `${c.url} (${c.confidence})`).join(" | ") || "-"}`);
  console.log(`    evidence     ${record.publicEvidence ? `${record.publicEvidence.url} signals=${(record.publicEvidence.signals ?? []).length}` : "-"}`);
  console.log(`    context      ${record.propertyContext ? `geocoded=${Boolean(record.propertyContext.geocoded)} sources=${record.propertyContext.sources?.map((s) => `${s.id}:${s.status}`).join(",")}` : "-"}`);
  console.log(`    score        ${record.appetiteResult ? `${record.appetiteResult.score}/100 raw ${record.appetiteResult.rawScore} ${record.appetiteResult.recommendation}` : "-"}`);
  for (const finding of record.findings ?? []) console.log(`    [${finding.result.padEnd(7)}] ${finding.label}: ${finding.detail.slice(0, 150)}${finding.detail.length > 150 ? "…" : ""} (${finding.source})`);
  console.log(`    brief        ${record.brief ?? "-"}`);
  console.log(`    question     ${record.question ?? "-"}`);
  console.log(`    draft(${record.draftStatus ?? "-"}) ${(record.draftEmail ?? "-").replace(/\s+/g, " ").slice(0, 400)}`);
}

async function trail(since: number) {
  const audit = await getAudit(id);
  for (const event of audit.slice(since)) {
    const detail = JSON.stringify(event.detail);
    console.log(`    · ${event.eventType.padEnd(28)} ${detail.length > 170 ? `${detail.slice(0, 170)}…` : detail}`);
  }
  return audit.length;
}

async function cleanup() {
  await db.query("DELETE FROM case_jobs WHERE case_id = $1", [id]);
  await db.query("DELETE FROM case_actions WHERE case_id = $1", [id]);
  await db.query("DELETE FROM audit_events WHERE case_id = $1", [id]);
  await db.query("DELETE FROM cases WHERE id = $1", [id]);
  await caseMemoryStore().remove([id]);
  log("cleaned up the case, its jobs, actions, audit trail, and memory");
}

async function main() {
  log(`case ${id}`);
  const sourceKey = `cases/${id}/submission.txt`;
  await putText(sourceKey, notes);
  await db.query(
    "INSERT INTO cases (id, insured_name, state, tiv, year_built, losses, source_key, public_source_url, address, appetite, origin) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
    [id, "Harbor Point Logistics LLC", "TX", 12_500_000, null, null, sourceKey, null, "2100 Ross Ave, Dallas, TX 75201", null, null],
  );
  await enqueueJob(id, "analyze", `analyze:${id}:0`);
  await db.query("INSERT INTO audit_events (case_id, event_type, event_key, detail) VALUES ($1, 'case_created', $2, '{}')", [id, `created:${id}`]);
  await drain("analyze");
  let seen = await trail(0);
  await show("after analyze");

  const record = await getCase(id);
  if (record?.status === "waiting_for_broker") {
    if (dropKey) { delete process.env.GEMINI_API_KEY; log("Gemini key dropped: the reply revision runs on the parser alone"); }
    const actionId = randomUUID();
    const replyKey = `cases/${id}/responses/${actionId}-${createHash("sha256").update(reply).digest("hex")}.txt`;
    await putText(replyKey, reply);
    await db.query("INSERT INTO case_actions (id, case_id, kind, source_key, reason) VALUES ($1, $2, 'broker_response', $3, NULL)", [actionId, id, replyKey]);
    await enqueueJob(id, "broker_response", `action:${actionId}`, { actionId });
    await drain("broker reply");
    seen = await trail(seen);
    await show("after broker reply");
  }

  const ready = await getCase(id);
  if (ready?.status === "review_ready") {
    const actionId = randomUUID();
    await db.query("INSERT INTO case_actions (id, case_id, kind, source_key, reason) VALUES ($1, $2, 'approve', NULL, $3)", [actionId, id, "Within appetite after the loss runs came in; masonry share confirmed."]);
    await enqueueJob(id, "decision", `action:${actionId}`, { actionId });
    await drain("decision");
    seen = await trail(seen);
    await show("after decision");
    const similar = await findSimilarCases(id);
    log(`similar cases via ${similar.path}: ${similar.summary ?? "none"}${similar.reason ? ` (${similar.reason})` : ""}`);
  } else {
    log(`case ended in ${ready?.status}; decision step skipped`);
  }
  const failed = await db.query("SELECT kind, attempts, last_error FROM case_jobs WHERE case_id = $1 AND last_error IS NOT NULL", [id]);
  log(failed.rows.length ? `JOB ERRORS: ${JSON.stringify(failed.rows)}` : "no job errors");
  if (!keep) await cleanup(); else log(`kept case ${id}`);
}

main().catch(async (error) => { console.error(error); process.exitCode = 1; if (!keep) await cleanup().catch(console.error); }).finally(async () => { await db.end().catch(() => undefined); process.exit(); });
