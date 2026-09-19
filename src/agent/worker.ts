import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities";
import { TASK_QUEUE } from "./contracts";
import { captureAgentError, initMonitoring } from "./monitoring";

async function main() {
  initMonitoring();
  const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233" });
  const worker = await Worker.create({
    connection,
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: TASK_QUEUE,
  });
  console.log(`Worker listening on ${TASK_QUEUE}`);
  await worker.run();
}

main().catch((error) => {
  captureAgentError(error);
  console.error(error);
  process.exitCode = 1;
});
