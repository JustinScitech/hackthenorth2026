import { db } from "../lib/db";
import { captureAgentError, initMonitoring } from "./monitoring";
import { processNextJob } from "./jobs";

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  initMonitoring();
  console.log("Case worker polling PostgreSQL");
  while (!stopping) {
    try {
      if (await processNextJob()) continue;
    } catch (error) {
      captureAgentError(error);
      console.error("Case worker poll failed", error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await db.end();
}

main().catch((error) => {
  captureAgentError(error);
  console.error(error);
  process.exitCode = 1;
});
