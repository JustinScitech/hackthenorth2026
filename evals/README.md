# Agent evals

Offline, deterministic evals for the underwriting agent's decision logic. They run without any sponsor credentials, so they are part of `npm test` and gate every change to extraction, guideline, or appetite code.

```bash
npm run eval                       # scorecard + ratchet check against evals/baseline.json
npm run eval -- --suite extraction # one suite
npm run eval:update                # rewrite the baseline from a full run (only after confirming an improvement)
EVAL_EXTRACTOR=gemini npm run eval -- --suite extraction   # measure the live Gemini pipeline instead of the parser
```

`data/eval-scorecard.json` holds the latest full result (ignored by Git).

## Suites

| Suite | What it measures | Source under test |
| --- | --- | --- |
| `extraction` | Year built and three-year loss count from broker notes. Tracks `hallucinated` (value invented where the note has none), `missed`, and `wrong` fields. | `src/agent/analysis.ts` `parseBrokerNotes`; with `EVAL_EXTRACTOR`, `src/agent/model.ts` |
| `guidelines` | Per-rule pass/refer/unknown, when to ask the broker, brief wording, fact provenance | `evaluateFacts`, `buildFacts` |
| `case-journey` | Multi-revision cases: pause for the broker, resume on each reply, reach review with the right facts | The same functions joined the way `src/agent/activities.ts` joins replies |
| `appetite` | Federato 2025 appetite thresholds per factor, score caps, nested exposure/claim derivation, currency | `src/federato/scoring.ts`, `derive.ts`, `schema.ts` |
| `ranking` | Two-page queue: complete pagination, bucket ordering, tie stability, summaries and markdown agree with scores | `src/federato/triage.ts`, `presentation.ts` |

## The ratchet

`evals/baseline.json` lists the cases that are currently allowed to fail. `npm test` fails when:

- a case not in the list fails (**regression**), or
- a listed case passes (**stale baseline**): the improvement must be locked in with `npm run eval:update`, so the list only ever shrinks on purpose.

Known failures are the upgrade backlog. Each carries a `note` explaining why the case matters to an underwriter. The loop is: pick a known failure, change the code, run `npm run eval`, confirm nothing else moved, run `npm run eval:update`, commit both.

## Adding cases

Add to the `*Cases` array in the relevant suite. Expected values are what a careful underwriter would take from the input: only explicitly stated facts, `null` when the input does not establish the fact. If the new case fails today, run `npm run eval:update` in the same commit so the baseline records it as a known failure rather than a regression.

Live model runs (`EVAL_EXTRACTOR=gemini` or `gemini-only`) are informational and never update the baseline; `scripts/eval-agent.ts` remains the persisted live eval shown on `/overview`.
