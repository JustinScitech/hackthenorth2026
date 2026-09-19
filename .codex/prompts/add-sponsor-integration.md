---
description: Scaffold an optional sponsor integration behind an env flag
argument-hint: <sponsor name> <env var name>
---

Add an optional integration for $ARGUMENTS following the existing pattern used by Browserbase, Sentry, Gemini, and ElevenLabs:

- The feature is off unless its env var is set. The core demo must keep working with no sponsor keys.
- Put the client in `src/agent/` (or `src/federato/` if it is triage-only) with a bounded timeout and a deterministic fallback.
- Expose it to the workflow only through an activity in `src/agent/activities.ts`.
- Document the env var in `.env.sponsors.example` and add a row to `docs/sponsor-map.md`.
- Add a unit test next to the module using `node --test` (see `src/agent/*.test.ts`).
- Run `npm run typecheck` and `npm test` before finishing.
