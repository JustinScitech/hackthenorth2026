import { indexCaseMemory } from "../src/agent/similar-cases";
import { db, listCases } from "../src/lib/db";

/**
 * `npm run mongo:backfill-memory` embeds every analysed case into `case_memory` so that cases
 * decided before the feature shipped count as precedent. Decided cases go first because they are
 * the ones a lookup can return; the rest are indexed so their own lookups need no fresh embedding.
 * Each case is one Gemini embedding call, spaced out so the free tier does not answer 429.
 */
const PAUSE_MS = Number(process.env.BACKFILL_PAUSE_MS ?? 1_500);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set; embeddings need it");
  const cases = (await listCases()).filter((record) => record.facts !== null);
  const decided = cases.filter((record) => record.status === "approved" || record.status === "declined");
  const rest = cases.filter((record) => !decided.includes(record));
  console.log(`${cases.length} analysed cases: ${decided.length} decided, ${rest.length} still open`);
  let indexed = 0;
  for (const [position, record] of [...decided, ...rest].entries()) {
    const result = await indexCaseMemory(record.id);
    console.log(`${result.indexed ? "indexed" : "skipped"} ${record.id} (${record.status}, ${record.insuredName})${result.reason ? `: ${result.reason}` : ""}`);
    if (result.indexed) indexed += 1;
    if (position < cases.length - 1) await pause(PAUSE_MS);
  }
  console.log(`Done: ${indexed} of ${cases.length} indexed`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => { await db.end().catch(() => undefined); process.exit(); });
