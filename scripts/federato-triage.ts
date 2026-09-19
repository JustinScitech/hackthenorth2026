import { writeFile, mkdir } from "node:fs/promises";
import { liveConfiguration } from "../src/federato/config";
import { runTriage } from "../src/federato/triage";

async function main() {
  const { client, options } = liveConfiguration();
  await mkdir("data", { recursive: true });
  const schema = await client.schema();
  await writeFile("data/federato-schema.json", JSON.stringify(schema, null, 2));
  const report = await runTriage({ schema: async () => schema, query: (query) => client.query(query) }, options);
  await writeFile("data/federato-triage.json", JSON.stringify(report, null, 2));
  console.table(report.topSubmissions.map(({ id, account, score, recommendation }) => ({ id, account, score, recommendation })));
  for (const item of report.topSubmissions) console.log(`${item.id}: ${item.explanation}`);
  console.log(`${report.evaluated}/${report.total} ${report.resource} records evaluated. ${report.truncated ? "WARNING: ranking is partial." : "Complete queue ranked."} Full report, schema, and query trace: data/federato-triage.json`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Triage failed."); process.exitCode = 1; });
