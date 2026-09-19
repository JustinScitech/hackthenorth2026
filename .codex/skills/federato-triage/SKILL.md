---
name: federato-triage
description: Working on the live Federato appetite triage flow in src/federato (schema discovery, pagination, scoring, ranking). Use for anything under /triage or scripts/federato-triage.ts.
---

# Federato triage

The triage flow is independent of Temporal and the local database. It authenticates with `FEDERATO_CLIENT_ID` / `FEDERATO_CLIENT_SECRET`, discovers the live schema, picks a resource (currently `Policy`, because it carries more appetite fields), paginates it, and ranks records against the 2025 sample appetite guidelines.

## Modules

- `client.ts`: auth and paginated fetch. Keep page size and max pages bounded.
- `schema.ts`: live schema discovery and reference-aware query construction.
- `derive.ts`: maps raw records to the fields scoring expects. Has tests.
- `scoring.ts`: factor weights and per-factor explanations. Every score must be explainable at factor level.
- `triage.ts`: orchestration and report shape. Has tests.

## Rules

- Scoring output is advisory. Nothing here binds coverage or writes back to Federato.
- The report must state which resource was scoped; do not present `Policy` results as a Submission queue.
- Changing weights in `scoring.ts` requires updating `docs/federato-gap-assessment.md` scoring assumptions.
- If the live API is unavailable, fail with a clear message; do not fabricate records.

## Verify

```
npm test
npm run triage
```
