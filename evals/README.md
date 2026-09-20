# Agent evals

Offline, deterministic evals for the underwriting agent's decision logic. They run without any sponsor credentials, so they are part of `npm test` and gate every change to extraction, appetite, enrichment, or quoting code. They sit alongside the versioned corpora in `evals/underwriting-appetite.json` and `evals/agent-notes/` (see `docs/underwriting-evals.md`), which `npm run eval:underwriting` and `npm run eval:agent` consume.

```bash
npm run eval                       # scorecard + ratchet check against evals/baseline.json
npm run eval -- --suite extraction # one suite
npm run eval:update                # rewrite the baseline from a full run (only after confirming an improvement)
EVAL_EXTRACTOR=pipeline npm run eval -- --suite extraction     # live Gemini + OpenAI + parser, resolved
EVAL_EXTRACTOR=gemini-only npm run eval -- --suite extraction  # or openai-only: one model on its own
EVAL_JUDGE=gemini npm run eval -- --suite brief-quality --suite verifier  # add the Gemini judge and live verifier as metrics
```

`data/eval-scorecard.json` holds the latest full result (ignored by Git).

## Suites

| Suite | What it measures | Source under test |
| --- | --- | --- |
| `extraction` | The whole fact schema from broker notes: year built, three-year loss count, and every carrier appetite field, each as `{value, quote}`. Tracks `hallucinated` (value invented where the note has none), `missed`, and `wrong` in total and per field (`missed:premium`), plus `badQuote` for a quote that is not a verbatim substring of the note or, for the parser, not the line or sentence the case pins. Includes every fixture in `evals/agent-notes/`. | `src/agent/extraction-schema.ts` `parserReading` (`parseBrokerNotes` + `brokerAppetite`); with `EVAL_EXTRACTOR`, `src/agent/model.ts` |
| `guidelines` | Carrier appetite review of a case: all eight per-factor results, when to ask the broker, fact provenance, and that a claim count never becomes loss dollars | `evaluateFacts`, `buildFacts` with `src/lib/case-appetite.ts` |
| `case-journey` | Multi-revision cases: broker appetite lines override the submission, pause for the broker, resume on each reply, reach review with the right facts | The same functions joined the way `src/agent/activities.ts` joins replies |
| `appetite` | Federato 2025 appetite thresholds per factor, score caps, nested exposure/claim derivation, currency | `src/federato/scoring.ts`, `derive.ts`, `schema.ts` |
| `ranking` | Two-page queue: complete pagination, bucket ordering, tie stability, summaries and markdown agree with scores | `src/federato/triage.ts`, `presentation.ts` |
| `counterfactual` | "What would change it": for each factor outside appetite or unknown, the smallest single-factor change that makes it pass, verified by re-scoring; nothing for passing cases; sentences never mention a passing factor; the required value is the exact edge the live scorer accepts | `src/federato/counterfactual.ts` |
| `resolution` | One fact from several sources (intake, Gemini, OpenAI, parser) for every value type in the schema: precedence, agreement, confidence, visible conflicts, and a quote that only ever comes from a source that stated the winning value | `src/agent/resolution.ts` |
| `enrichment` | Public pages fetched by Browserbase become cited structured signals; signals corroborate, contradict, or add findings without replacing facts. The model pass (`merge:` cases) must quote the page, keeps the parser as the floor, and turns parser/model disagreement into a conflict rather than an overwrite | `src/agent/enrichment.ts`, `src/agent/evidence-model.ts` |
| `discovery` | Source discovery for cases without a URL: a saved search page is ranked so the county assessor outranks listings and other states, only guarded HTTPS URLs are offered, and nothing relevant means no candidates | `src/agent/source-discovery.ts` |
| `quote` | Intact tenant/auto quoting: required facts, referrals to a person, explained factors, monotonic pricing, conversational intake | `src/quote/rating.ts`, `src/quote/intake.ts` |
| `verifier` | Source verifier: findings whose values are in no source become referrals with a "Verifier" prefix, supported findings and refer results are untouched, the deterministic guard overrules the model's unquoted or contradicted objections, and malformed JSON, timeouts, and a missing key skip without failing the case | `src/agent/verifier.ts` with a scripted model; `EVAL_JUDGE=gemini` also runs the live model and records `live_hits`, `live_misses`, `live_false_flags` |
| `brief-quality` | The brief's rubric: cites sources (every factor it names is a finding with a source), invents no numbers (every year, dollar amount, and percentage is in the sources or the reviewer's own scoring), states the recommendation, at most `MAX_BRIEF_SENTENCES` sentences. Negative controls prove the floor catches each violation | Deterministic floor decides pass/fail; `EVAL_JUDGE=gemini` scores the same rubric with Gemini and records `judge_agreed` / `judge_disagreed` |
| `telemetry` | Sentry events, logs, and spans never carry submission text | `src/agent/monitoring.ts` |
| `similar-cases` | Precedent retrieval over synthetic briefs: nearest decided neighbours share state, construction and decision; the case never appears in its own results; the summary line counts exactly the returned set and cites only stored referred findings. Runs on the deterministic local embedding; the Atlas `$vectorSearch` case runs only when `MONGODB_URI` is an Atlas URI | `src/agent/similar-cases.ts`, `src/lib/mongo.ts` |

## Prize-track coverage

| Devpost prize | Judged on | Suites |
| --- | --- | --- |
| Federato | ingest, enrich with real-world data, appetite insights | `appetite`, `ranking`, `counterfactual`, `enrichment`, `case-journey` |
| Rox | messy, incomplete, conflicting sources; decisions under uncertainty | `extraction`, `resolution`, `guidelines` |
| Intact | car/tenant quoting via AI; estimate or next step; accessibility | `quote` |
| Browserbase | Browserbase meaningfully powers the experience with real web data | `enrichment`, `discovery` (live fetch and search are exercised by E2E, not here) |
| OpenAI | OpenAI API powers the experience | `resolution`; `EVAL_EXTRACTOR=openai-only` on `extraction` |
| Sentry | two products beyond errors, data that shaped the build | `telemetry` (privacy invariants) |
| Rox / Federato | findings an underwriter can trust: nothing in the review that the sources do not say | `verifier`, `brief-quality` |

## The LLM judge

`EVAL_JUDGE=gemini` (with `GEMINI_API_KEY`) adds Gemini to two suites: `brief-quality` scores each brief against the same four-item rubric the floor uses, and `verifier` runs the live model over the fixtures with known-unsupported findings. Both are recorded as suite metrics (`judge_agreed`, `judge_disagreed`, `live_hits`, `live_false_flags`) and in each case's detail; pass or fail always comes from the deterministic floor, so a flaky judge can neither break nor pad the ratchet. `npm run eval` loads `.env`, so the key alone never switches a suite to a live model.

## The ratchet

`evals/baseline.json` lists the cases that are currently allowed to fail. `npm test` fails when:

- a case not in the list fails (**regression**), or
- a listed case passes (**stale baseline**): the improvement must be locked in with `npm run eval:update`, so the list only ever shrinks on purpose.

Known failures are the upgrade backlog. Each carries a `note` explaining why the case matters to an underwriter. The loop is: pick a known failure, change the code, run `npm run eval`, confirm nothing else moved, run `npm run eval:update`, commit both.

## Adding cases

Add to the `*Cases` array in the relevant suite. Expected values are what a careful underwriter would take from the input: only explicitly stated facts, `null` when the input does not establish the fact. If the new case fails today, run `npm run eval:update` in the same commit so the baseline records it as a known failure rather than a regression.

Live model runs (`EVAL_EXTRACTOR=pipeline`, `gemini-only`, or `openai-only`) are informational and never update the baseline; `scripts/eval-agent.ts` remains the persisted live eval shown on `/overview`.
