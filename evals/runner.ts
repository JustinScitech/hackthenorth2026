import { readFileSync } from "node:fs";

/**
 * Offline eval harness for the underwriting agent. Every suite is deterministic
 * unless EVAL_EXTRACTOR selects a live model, so `npm test` can enforce the
 * baseline ratchet without any sponsor credentials.
 */
export type CaseResult = {
  name: string;
  passed: boolean;
  /** What went wrong, for the console report. Empty when passed. */
  detail?: string;
  /** Why this case exists; shown next to known failures so the upgrade loop has a target. */
  note?: string;
  /** Per-case measurements aggregated into suite metrics (for example hallucinated fields). */
  metrics?: Record<string, number>;
};

export type RunOptions = {
  /** Which extractor the extraction suite measures. Guideline and appetite suites ignore it. */
  extractor: "parser" | "pipeline" | "gemini-only" | "openai-only";
  /** Pause between live model calls to stay under per-minute quotas. */
  modelDelayMs: number;
  log?: (line: string) => void;
};

export type Suite = {
  name: string;
  description: string;
  run(options: RunOptions): Promise<CaseResult[]>;
};

export type SuiteResult = {
  name: string;
  description: string;
  passed: number;
  total: number;
  metrics: Record<string, number>;
  cases: CaseResult[];
};

export type Scorecard = { generatedAt: string; extractor: RunOptions["extractor"]; suites: SuiteResult[] };

/**
 * The ratchet: names of cases that are allowed to fail today. A case that
 * starts passing must be removed (run `npm run eval:update`), and a case that
 * starts failing without being listed is a regression.
 */
export type Baseline = { knownFailures: Record<string, string[]> };

export function defaultOptions(overrides: Partial<RunOptions> = {}): RunOptions {
  const extractor = process.env.EVAL_EXTRACTOR;
  return {
    extractor: extractor === "pipeline" || extractor === "gemini-only" || extractor === "openai-only" ? extractor : "parser",
    modelDelayMs: Number(process.env.EVAL_MODEL_DELAY_MS ?? 4000),
    ...overrides,
  };
}

export async function runSuites(suites: Suite[], options: RunOptions): Promise<Scorecard> {
  const results: SuiteResult[] = [];
  for (const suite of suites) {
    const cases = await suite.run(options);
    const metrics: Record<string, number> = {};
    for (const item of cases) for (const [key, value] of Object.entries(item.metrics ?? {})) metrics[key] = (metrics[key] ?? 0) + value;
    results.push({ name: suite.name, description: suite.description, passed: cases.filter((item) => item.passed).length, total: cases.length, metrics, cases });
  }
  return { generatedAt: new Date().toISOString(), extractor: options.extractor, suites: results };
}

export function loadBaseline(): Baseline {
  return JSON.parse(readFileSync(new URL("./baseline.json", import.meta.url), "utf8")) as Baseline;
}

export function baselineFromScorecard(scorecard: Scorecard): Baseline {
  const knownFailures: Record<string, string[]> = {};
  for (const suite of scorecard.suites) {
    const failed = suite.cases.filter((item) => !item.passed).map((item) => item.name).sort();
    if (failed.length) knownFailures[suite.name] = failed;
  }
  return { knownFailures };
}

export type RatchetViolation = { suite: string; name: string; kind: "regression" | "stale_baseline"; detail?: string };

/** Compares a scorecard against the baseline; empty result means the ratchet holds. */
export function checkRatchet(scorecard: Scorecard, baseline: Baseline): RatchetViolation[] {
  const violations: RatchetViolation[] = [];
  for (const suite of scorecard.suites) {
    const known = new Set(baseline.knownFailures[suite.name] ?? []);
    for (const item of suite.cases) {
      if (!item.passed && !known.has(item.name)) violations.push({ suite: suite.name, name: item.name, kind: "regression", detail: item.detail });
      if (item.passed && known.has(item.name)) violations.push({ suite: suite.name, name: item.name, kind: "stale_baseline" });
    }
    for (const name of known) {
      if (!suite.cases.some((item) => item.name === name)) violations.push({ suite: suite.name, name, kind: "stale_baseline", detail: "case no longer exists" });
    }
  }
  return violations;
}

export function formatScorecard(scorecard: Scorecard, baseline?: Baseline): string {
  const lines: string[] = [];
  const width = Math.max(...scorecard.suites.map((suite) => suite.name.length));
  lines.push(`Agent evals · extractor ${scorecard.extractor} · ${scorecard.generatedAt}`);
  lines.push("");
  for (const suite of scorecard.suites) {
    const rate = suite.total ? Math.round((suite.passed / suite.total) * 100) : 0;
    const metrics = Object.entries(suite.metrics).map(([key, value]) => `${key}=${value}`).join(" ");
    lines.push(`${suite.name.padEnd(width)}  ${String(suite.passed).padStart(3)}/${String(suite.total).padEnd(3)} ${String(rate).padStart(3)}%  ${metrics}`);
  }
  const total = scorecard.suites.reduce((sum, suite) => sum + suite.total, 0);
  const passed = scorecard.suites.reduce((sum, suite) => sum + suite.passed, 0);
  lines.push(`${"overall".padEnd(width)}  ${String(passed).padStart(3)}/${String(total).padEnd(3)} ${String(total ? Math.round((passed / total) * 100) : 0).padStart(3)}%`);
  const failures = scorecard.suites.flatMap((suite) => suite.cases.filter((item) => !item.passed).map((item) => ({ suite: suite.name, ...item })));
  if (failures.length) {
    lines.push("", "Failures:");
    for (const item of failures) {
      const known = baseline?.knownFailures[item.suite]?.includes(item.name) ? " (known)" : "";
      lines.push(`- [${item.suite}] ${item.name}${known}: ${item.detail ?? "failed"}${item.note ? `\n    why it matters: ${item.note}` : ""}`);
    }
  }
  return lines.join("\n");
}

/** Deep-equal for the small JSON-like values evals compare. */
export function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Runs one case, turning a thrown error into a failed result. `check` returns
 * the list of problems; an empty list passes.
 */
export function attempt(name: string, check: () => string[], note?: string): CaseResult {
  try {
    const problems = check();
    return { name, passed: problems.length === 0, detail: problems.join("; ") || undefined, note };
  } catch (error) {
    return { name, passed: false, detail: `threw ${error instanceof Error ? error.message : String(error)}`, note };
  }
}

export async function attemptAsync(name: string, check: () => Promise<string[]>, note?: string): Promise<CaseResult> {
  try {
    const problems = await check();
    return { name, passed: problems.length === 0, detail: problems.join("; ") || undefined, note };
  } catch (error) {
    return { name, passed: false, detail: `threw ${error instanceof Error ? error.message : String(error)}`, note };
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
