---
name: case-jobs
description: Rules for editing durable case jobs, activities, the worker, and case action routes.
---

# Durable case jobs

- `src/agent/jobs.ts` owns job claiming, retries, leases, and scheduled broker follow-ups.
- `src/agent/activities.ts` owns retryable case and audit transitions. Activities must tolerate repeated execution after worker restarts.
- `src/agent/worker.ts` polls PostgreSQL. The web app only queues jobs.
- Keep case creation and its first job in one transaction. Keep action persistence and its job in one transaction.
- Use stable job keys and audit event keys so a retried request or expired lease cannot create duplicate actions.
- Do not store model private chain-of-thought in case data or audit events.
- Preserve the 24-hour broker follow-up audit behavior without sending a message automatically.

Verify with `npm run typecheck`, `npm test`, and the real lifecycle in `npm run test:e2e`.
