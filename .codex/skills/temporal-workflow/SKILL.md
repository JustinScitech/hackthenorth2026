---
name: temporal-workflow
description: Rules for editing the durable case workflow, activities, and signals in src/agent. Use whenever a change touches workflows.ts, activities.ts, contracts.ts, or the worker.
---

# Temporal workflow rules for this repo

## Where things live

- `src/agent/workflows.ts`: orchestration only. Deterministic. Signals: broker response, underwriter decision. A durable 24h timer marks broker follow-up as due.
- `src/agent/activities.ts`: every retryable I/O call. Each activity must be safe to run twice.
- `src/agent/contracts.ts`: task queue name, workflow ID scheme (workflow ID == case ID), signal and query names. Change these in one place only.
- `src/agent/worker.ts`: registers workflows and activities; loads `.env` via `--env-file`.

## Hard constraints

1. Workflow code cannot import `pg`, `mongodb`, `openai`, `@google/genai`, or anything that does I/O. Pass IDs and small typed results; large payloads stay in Mongo/Postgres.
2. Use `continueAsNew` with the small phase/follow-up checkpoint when Temporal suggests it. Do not add state to the checkpoint without updating the resume path.
3. New activities need a timeout and a retry policy. No unbounded waits.
4. Never persist model chain-of-thought to the case trace or audit events.

## Verify

```
npm run typecheck
npm test
```

For a live check: `docker compose up -d`, `npm run worker` in one terminal, `npm run dev` in another, then create a case at `/cases/new` and watch it in the Temporal UI at http://localhost:8080.
