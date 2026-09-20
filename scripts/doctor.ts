import { MongoClient, ServerApiVersion } from "mongodb";
import { FederatoClient } from "../src/federato/client";
import { db } from "../src/lib/db";
import { databaseUrl, inlineJobsEnabled, isDeployed, mongoUri } from "../src/lib/env";

/**
 * `npm run doctor` answers "is the backend running properly?" in one screen: databases, schema,
 * the job queue and whoever drains it, the last ranked queue, and each external service. Run it
 * with VERCEL=1 to point the same checks at the hosted database and Atlas, the way the deployment sees them.
 */
type Status = "pass" | "warn" | "fail";
type Check = { name: string; status: Status; detail: string };
const checks: Check[] = [];
const add = (name: string, status: Status, detail: string) => checks.push({ name, status, detail });
const host = (url: string) => { try { return new URL(url).hostname; } catch { return "unparseable URL"; } };
const minutes = (date: Date | string | null | undefined) => date ? Math.round((Date.now() - new Date(date).getTime()) / 60_000) : null;

async function postgres() {
  try {
    const target = databaseUrl();
    const now = await db.query("SELECT now() AS now");
    add("PostgreSQL", "pass", `${host(target)} answers; server time ${new Date(now.rows[0].now).toISOString()}`);
  } catch (error) { add("PostgreSQL", "fail", error instanceof Error ? error.message : String(error)); return false; }
  const columns = await db.query("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'cases' AND column_name IN ('address', 'property_context', 'origin', 'source_candidates', 'draft_email', 'draft_status', 'state', 'tiv')");
  const have = new Map(columns.rows.map((row) => [row.column_name as string, row.is_nullable === "YES"]));
  const tables = new Set((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).rows.map((row) => row.table_name as string));
  const missing = ["address", "property_context", "origin", "source_candidates", "draft_email", "draft_status"].filter((name) => !have.has(name));
  if (!tables.has("triage_reports")) missing.push("triage_reports table");
  if (have.get("state") === false || have.get("tiv") === false) missing.push("nullable cases.state and cases.tiv");
  const jobKinds = await db.query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'case_jobs_kind_check'");
  if (!String(jobKinds.rows[0]?.def ?? "").includes("'research'")) missing.push("the research job kind on case_jobs");
  add("Schema", missing.length ? "fail" : "pass", missing.length ? `missing ${missing.join(", ")}; run npm run db:migrate against this database` : "every table and column the current code writes is present");
  const jobs = await db.query(`SELECT status, count(*)::int AS n, min(run_at) AS oldest, bool_or(lease_until > now()) AS leased FROM case_jobs WHERE finished_at IS NULL GROUP BY status`);
  const stalled = jobs.rows.filter((row) => row.status === "queued" && minutes(row.oldest)! > 2 || row.status === "running" && !row.leased);
  const lastDone = await db.query("SELECT max(finished_at) AS at, sum((status = 'failed')::int)::int AS failed FROM case_jobs WHERE finished_at > now() - interval '24 hours'");
  const drainer = inlineJobsEnabled() ? "the web app drains jobs inline after each response" : "npm run worker must be running locally";
  add("Job queue", stalled.length ? "fail" : "pass", `${jobs.rows.reduce((sum, row) => sum + row.n, 0)} open; ${stalled.length ? `${stalled.map((row) => `${row.n} ${row.status} since ${minutes(row.oldest)} min`).join(", ")} without a drainer` : "nothing stalled"}; last finished ${minutes(lastDone.rows[0].at) ?? "never"} min ago; ${lastDone.rows[0].failed ?? 0} failed in 24 h; ${drainer}`);
  const errors = await db.query("SELECT left(last_error, 90) AS err, count(*)::int AS n FROM case_jobs WHERE last_error IS NOT NULL AND updated_at > now() - interval '24 hours' GROUP BY 1 ORDER BY 2 DESC LIMIT 3");
  if (errors.rows.length) add("Recent job errors", "warn", errors.rows.map((row) => `${row.n}× ${row.err}`).join(" | "));
  const cases = await db.query("SELECT status, count(*)::int AS n FROM cases GROUP BY status ORDER BY n DESC");
  add("Cases", "pass", cases.rows.map((row) => `${row.n} ${row.status}`).join(", ") || "none yet");
  if (tables.has("triage_reports")) {
    const report = await db.query("SELECT generated_at, evaluated, total FROM triage_reports ORDER BY generated_at DESC LIMIT 1");
    const row = report.rows[0];
    add("Ranked queue", row ? "pass" : "warn", row ? `${row.evaluated} of ${row.total} submissions, ranked ${minutes(row.generated_at)} min ago` : "no ranked queue stored yet; open /triage and rank it");
  }
  return true;
}

async function mongo() {
  let uri: string;
  try { uri = mongoUri(); } catch (error) { add("MongoDB", "fail", error instanceof Error ? error.message : String(error)); return; }
  const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: true }, serverSelectionTimeoutMS: 10_000 });
  try {
    await client.connect();
    const database = client.db(process.env.MONGODB_DB ?? "underwriting_agent");
    await database.command({ ping: 1 });
    const names = (await database.listCollections().toArray()).map((collection) => collection.name);
    add("MongoDB", "pass", `${host(uri)} answers; collections: ${names.join(", ") || "none yet"}`);
  } catch (error) {
    add("MongoDB", "fail", `${host(uri)}: ${error instanceof Error ? error.message.slice(0, 140) : String(error)}${/tls|ssl|ReplicaSetNoPrimary/i.test(String(error)) ? " (Atlas Network Access may be refusing this address)" : ""}`);
  } finally { await client.close().catch(() => undefined); }
}

async function federato() {
  if (!process.env.FEDERATO_CLIENT_ID || !process.env.FEDERATO_CLIENT_SECRET) { add("Federato", "warn", "FEDERATO_CLIENT_ID and FEDERATO_CLIENT_SECRET unset; the live queue cannot be ranked"); return; }
  const started = performance.now();
  try {
    const schema = await new FederatoClient({ clientId: process.env.FEDERATO_CLIENT_ID, clientSecret: process.env.FEDERATO_CLIENT_SECRET }).schema();
    const resources = schema && typeof schema === "object" ? Object.keys(schema as object) : [];
    add("Federato", resources.includes("Submission") ? "pass" : "warn", `authenticated and discovered ${resources.length} resources in ${Math.round(performance.now() - started)} ms${resources.includes("Submission") ? "" : "; no Submission resource"}`);
  } catch (error) { add("Federato", "fail", error instanceof Error ? error.message : String(error)); }
}

async function gemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { add("Gemini", "warn", "GEMINI_API_KEY unset; extraction falls back to the parser"); return; }
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL || "gemini-3.5-flash-lite")}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with the single word ok." }] }] }), signal: AbortSignal.timeout(20_000),
    });
    add("Gemini", response.ok ? "pass" : response.status === 429 ? "warn" : "fail", response.ok ? `${process.env.GEMINI_MODEL || "gemini-3.5-flash-lite"} answers` : `HTTP ${response.status}${response.status === 429 ? ": quota exhausted, the parser carries extraction until it resets" : ""}`);
  } catch (error) { add("Gemini", "fail", error instanceof Error ? error.message : String(error)); }
}

async function main() {
  console.log(`Backend doctor · ${isDeployed() ? "hosted targets (VERCEL set)" : "local targets"} · ${new Date().toISOString()}\n`);
  const ok = await postgres();
  await Promise.all([mongo(), federato(), gemini()]);
  const width = Math.max(...checks.map((check) => check.name.length));
  for (const check of checks) console.log(`${check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL"}  ${check.name.padEnd(width)}  ${check.detail}`);
  const failed = checks.filter((check) => check.status === "fail").length;
  console.log(`\n${failed ? `${failed} check(s) failed` : "Backend is ready"}`);
  if (ok) await db.end();
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
