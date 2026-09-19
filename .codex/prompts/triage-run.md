---
description: Run the Federato triage script and summarize ranking changes
---

Run `npm run triage` and compare the output with the previous run recorded in the conversation, if any.

Summarize: the resource selected from the live schema, how many records were paginated, the top five ranked records with their dominant scoring factors, and any records whose rank moved by more than three positions. If the schema discovery step fails, report the exact error and stop. Do not modify `src/federato/scoring.ts` weights without asking.
