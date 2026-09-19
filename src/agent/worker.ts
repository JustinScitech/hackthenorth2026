import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities";
import { TASK_QUEUE } from "./task-queue";
import { captureAgentError, initMonitoring, monitorActivities } from "./monitoring";
import { temporalConfig } from "./temporal-config";

async function main() {
  initMonitoring();
  const { connectionOptions, namespace } = temporalConfig();
  const connection = await NativeConnection.connect(connectionOptions);
  const worker = await Worker.create({
    connection,
    namespace,
    workflowsPath: require.resolve("./workflows"),
    activities: monitorActivities(activities),
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
