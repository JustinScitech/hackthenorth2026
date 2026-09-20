# Agent evals

Offline, deterministic evals for the underwriting agent's decision logic. They run without any sponsor credentials, so they are part of `npm test` and gate every change to extraction, appetite, enrichment, or quoting code. They sit alongside the versioned corpora in `evals/underwriting-appetite.json` and `evals/agent-notes/` (see `docs/underwriting-evals.md`), which `npm run eval:underwriting` and `npm run eval:agent` consume.

```bash
npm run eval                       # scorecard + ratchet check against evals/baseline.json
npm run eval -- --suite extraction # one suite
npm run eval:update                # rewrite the baseline from a full run (only after confirming an improvement)
EVAL_EXTRACTOR=pipeline npm run eval -- --suite extraction     # live Gemini + OpenAI + parser, resolved
EVAL_EXTRACTOR=gemini-only npm run eval -- --suite extraction  # or openai-only: one model on its own
```

`data/eval-scorecard.json` holds the latest full result (ignored by Git).

## Suites

| Suite | What it measures | Source under test |
| --- | --- | --- |
| `extraction` | Year built and three-year loss count from broker notes. Tracks `hallucinated` (value invented where the note has none), `missed`, and `wrong` fields. | `src/agent/analysis.ts` `parseBrokerNotes`; with `EVAL_EXTRACTOR`, `src/agent/model.ts` |
| `guidelines` | Carrier appetite review of a case: all eight per-factor results, when to ask the broker, fact provenance, and that a claim count never becomes loss dollars | `evaluateFacts`, `buildFacts` with `src/lib/case-appetite.ts` |
| `case-journey` | Multi-revision cases: broker appetite lines override the submission, pause for the broker, resume on each reply, reach review with the right facts | The same functions joined the way `src/agent/activities.ts` joins replies |
| `appetite` | Federato 2025 appetite thresholds per factor, score caps, nested exposure/claim derivation, currency | `src/federato/scoring.ts`, `derive.ts`, `schema.ts` |
| `ranking` | Two-page queue: complete pagination, bucket ordering, tie stability, summaries and markdown agree with scores | `src/federato/triage.ts`, `presentation.ts` |
| `resolution` | One fact from several sources (intake, Gemini, OpenAI, parser): precedence, agreement, confidence, visible conflicts | `src/agent/resolution.ts` |
| `enrichment` | Public pages fetched by Browserbase become cited structured signals; signals corroborate, contradict, or add findings without replacing facts | `src/agent/enrichment.ts` |
| `quote` | Intact tenant/auto quoting: required facts, referrals to a person, explained factors, monotonic pricing, conversational intake | `src/quote/rating.ts`, `src/quote/intake.ts` |
| `telemetry` | Sentry events, logs, and spans never carry submission text | `src/agent/monitoring.ts` |

## Prize-track coverage

| Devpost prize | Judged on | Suites |
| --- | --- | --- |
| Federato | ingest, enrich with real-world data, appetite insights | `appetite`, `ranking`, `enrichment`, `case-journey` |
| Rox | messy, incomplete, conflicting sources; decisions under uncertainty | `extraction`, `resolution`, `guidelines` |
| Intact | car/tenant quoting via AI; estimate or next step; accessibility | `quote` |
| Browserbase | Browserbase meaningfully powers the experience with real web data | `enrichment` (live fetch is exercised by E2E, not here) |
| OpenAI | OpenAI API powers the experience | `resolution`; `EVAL_EXTRACTOR=openai-only` on `extraction` |
| Sentry | two products beyond errors, data that shaped the build | `telemetry` (privacy invariants) |

## The ratchet

`evals/baseline.json` lists the cases that are currently allowed to fail. `npm test` fails when:

- a case not in the list fails (**regression**), or
- a listed case passes (**stale baseline**): the improvement must be locked in with `npm run eval:update`, so the list only ever shrinks on purpose.

Known failures are the upgrade backlog. Each carries a `note` explaining why the case matters to an underwriter. The loop is: pick a known failure, change the code, run `npm run eval`, confirm nothing else moved, run `npm run eval:update`, commit both.

## Adding cases

Add to the `*Cases` array in the relevant suite. Expected values are what a careful underwriter would take from the input: only explicitly stated facts, `null` when the input does not establish the fact. If the new case fails today, run `npm run eval:update` in the same commit so the baseline records it as a known failure rather than a regression.

Live model runs (`EVAL_EXTRACTOR=pipeline`, `gemini-only`, or `openai-only`) are informational and never update the baseline; `scripts/eval-agent.ts` remains the persisted live eval shown on `/overview`.
