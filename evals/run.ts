import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { baselineFromScorecard, checkRatchet, defaultOptions, formatScorecard, loadBaseline, runSuites } from "./runner";
import { suites } from "./suites";

/**
 * `npm run eval` prints the scorecard and checks the ratchet against evals/baseline.json.
 * `npm run eval:update` rewrites the baseline from the current run; only do that after
 * confirming each change is an improvement, since it is what future runs regress against.
 * `EVAL_EXTRACTOR=pipeline|gemini-only|openai-only npm run eval -- --suite extraction` measures
 * the live models instead of the parser; live results are reported but never ratcheted.
 */
async function main() {
  const { values } = parseArgs({ options: { suite: { type: "string", multiple: true }, "update-baseline": { type: "boolean" }, quiet: { type: "boolean" } } });
  const selected = values.suite?.length ? suites.filter((suite) => values.suite!.includes(suite.name)) : suites;
  if (!selected.length) throw new Error(`Unknown suite. Available: ${suites.map((suite) => suite.name).join(", ")}`);
  const options = defaultOptions({ log: values.quiet ? undefined : (line) => console.log(line) });
  const scorecard = await runSuites(selected, options);
  const baseline = loadBaseline();
  console.log("");
  console.log(formatScorecard(scorecard, baseline));

  mkdirSync("data", { recursive: true });
  writeFileSync("data/eval-scorecard.json", JSON.stringify(scorecard, null, 2));
  console.log("\nScorecard written to data/eval-scorecard.json");

  if (options.extractor !== "parser") {
    console.log(`Live ${options.extractor} run: results are informational and not compared to the baseline.`);
    return;
  }
  if (values["update-baseline"]) {
    if (selected.length !== suites.length) throw new Error("Update the baseline from a full run, not a filtered one.");
    writeFileSync(new URL("./baseline.json", import.meta.url), `${JSON.stringify(baselineFromScorecard(scorecard), null, 2)}\n`);
    console.log("Baseline updated: evals/baseline.json");
    return;
  }
  const violations = checkRatchet({ ...scorecard, suites: scorecard.suites }, { knownFailures: Object.fromEntries(selected.map((suite) => [suite.name, baseline.knownFailures[suite.name] ?? []])) });
  if (violations.length) {
    console.log("\nRatchet violations:");
    for (const violation of violations) console.log(`- ${violation.kind} [${violation.suite}] ${violation.name}${violation.detail ? `: ${violation.detail}` : ""}`);
    console.log("A regression means a previously passing case now fails. A stale baseline means a known failure now passes; run `npm run eval:update` to lock it in.");
    process.exitCode = 1;
  } else {
    console.log("Ratchet holds: no regressions against evals/baseline.json.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
