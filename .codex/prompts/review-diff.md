---
description: Review the current working tree diff against the underwriting-agent rules
argument-hint: [optional focus area]
---

Review `git diff` (staged and unstaged) for this repository. Focus: $ARGUMENTS

Check specifically for:

1. Temporal determinism. Nothing in `src/agent/workflows.ts` may call `Date.now()`, `Math.random()`, network, or the database directly. All I/O belongs in `activities.ts` and must be idempotent, since activities retry.
2. Chain-of-thought leakage. The case trace and audit log must never persist or render a model's private reasoning. Only structured extraction results and factor-level explanations are allowed.
3. Guideline scope. The original case flow uses fictional demo rules; the Federato triage flow uses the 2025 sample appetite guidelines. Do not let either flow auto-bind coverage.
4. Next.js 16 conventions from `node_modules/next/dist/docs/`. Flag any API that the docs mark deprecated.
5. Secrets. `.env` is gitignored; any new integration key must be added to `.env.sponsors.example` with a comment, never hard-coded.

Report findings ranked by severity with `file:line` references. Do not edit files.
