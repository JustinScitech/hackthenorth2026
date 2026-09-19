import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const result = z.enum(["pass", "refer", "unknown"]);
const fixture = z.object({
  id: z.string().min(1),
  source: z.object({ title: z.string().min(1), location: z.string().min(1) }),
  notes: z.string().min(1),
  expected: z.object({ yearBuilt: z.number().int().nullable(), losses: z.number().int().nonnegative().nullable() }),
  intake: z.object({ state: z.string(), tiv: z.number(), yearBuilt: z.number().int().nullable(), losses: z.number().int().nonnegative().nullable() }),
  expectedFindings: z.object({ territory: result, tiv: result, construction: result, losses: result }),
  needsBroker: z.boolean(),
});
export type AgentEvaluationCase = z.infer<typeof fixture>;

export function loadAgentEvaluationCases(directory = fileURLToPath(new URL("../../evals/agent-notes/", import.meta.url))): AgentEvaluationCase[] {
  const files = readdirSync(directory).filter((name) => name.endsWith(".json")).sort();
  const cases = files.flatMap((name) => z.array(fixture).min(1).parse(JSON.parse(readFileSync(join(directory, name), "utf8"))));
  if (new Set(cases.map((item) => item.id)).size !== cases.length) throw new Error("Agent evaluation IDs must be unique.");
  return cases;
}
