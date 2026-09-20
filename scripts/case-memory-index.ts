import { CASE_MEMORY_INDEX_DEFINITION, ensureCaseMemoryIndex } from "../src/lib/mongo";
import { CASE_MEMORY_COLLECTION, CASE_MEMORY_INDEX } from "../src/agent/similar-cases";

/**
 * `npm run mongo:vector-index` creates the Atlas Vector Search index behind "Similar past cases"
 * on whatever MONGODB_URI points at, and reports its build status. Local MongoDB has no search
 * indexes, so there it prints `unsupported` and the app ranks in-app instead (see docs/deployment.md).
 */
async function main() {
  console.log(`Index ${CASE_MEMORY_INDEX} on ${CASE_MEMORY_COLLECTION}: ${JSON.stringify(CASE_MEMORY_INDEX_DEFINITION)}`);
  const result = await ensureCaseMemoryIndex();
  console.log(result.created ? `Created; status ${result.status}. Atlas builds it in the background; similar-case lookups use in-app cosine until it is READY.` : `Status: ${result.status}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(() => process.exit());
