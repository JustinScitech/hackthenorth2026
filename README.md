# Underwriting review agent

A durable, human-reviewed commercial property underwriting demo. Each case runs as a Temporal workflow. The worker extracts facts from a broker submission, checks sample guidelines, pauses for missing information, and resumes when a broker response arrives. An underwriter makes the final review decision.

The guideline thresholds in this repository are **fictional demo rules** and must not be used to make real insurance decisions.

## Stack

- Next.js: case intake, progress, review, and API
- Temporal: durable workflow, retries, broker/underwriter signals
- PostgreSQL: case records and audit events
- MinIO: original broker submission text (S3-compatible object storage)
- Optional OpenAI API: structured extraction from unstructured broker notes; deterministic fallback works without a key
- Optional Browserbase: visit an explicitly supplied public source and attach a cited excerpt to the case
- Optional Sentry: privacy-minimized worker error monitoring

## Code layout

- `src/agent/workflows.ts`: deterministic Temporal orchestration, signals, durable waits, and history rotation
- `src/agent/activities.ts`: retryable I/O and idempotent case/audit transitions
- `src/agent/analysis.ts` and `model.ts`: fictional guideline checks and optional text extraction
- `src/agent/public-source.ts`: bounded Browserbase evidence capture; public URL validation is separate
- `src/agent/contracts.ts`, `client.ts`, and `worker.ts`: shared Temporal names, API client, and worker process
- `src/lib`: shared case types, PostgreSQL access, and S3-compatible storage
- `src/app`: web UI and HTTP endpoints; it does not execute agent activities

## Run locally

1. Start Docker Desktop.
2. Copy `.env.example` to `.env.local` and adjust values if necessary.
3. Run `docker compose up -d`.
4. Run `npm install` and `npm run db:migrate`.
5. In one terminal, run `npm run worker`.
6. In another terminal, run `npm run dev` and open http://localhost:3000.

Temporal UI is at http://localhost:8080 and MinIO console is at http://localhost:9001. The demo does not require an OpenAI key.

Set `BROWSERBASE_API_KEY` to enable public-source visits and `SENTRY_DSN` to enable worker monitoring. Both are optional. The public-source field accepts an explicit HTTPS URL; it does not discover or profile people. External page text is displayed as evidence, not treated as a verified underwriting fact or used to approve coverage.

## Durable case lifecycle

`received -> extracting -> checking -> waiting_for_broker (optional) -> review_ready -> approved/declined`

The case ID is the Temporal workflow ID. A broker response and an underwriter decision are durable signals, so a stopped worker can resume after restart. A durable 24-hour timer records when broker follow-up is due; it does not send a message. Activities are bounded and retryable. Submissions and audit data are stored outside workflow history; the workflow passes IDs and small typed results. When Temporal recommends it, the workflow continues as new with a small phase/follow-up checkpoint so long waits do not grow the execution history indefinitely. Changes to an existing submission should create a new case version in a production integration.

## Checks

Run `npm run typecheck`, `npm test`, and `npm run build`.

## Sponsor fit and remaining work

The project is an underwriting case investigator, not a bundle of unrelated sponsor demos. Prize eligibility depends on this year's published rules and an actual configured integration, not a placeholder or package dependency.

| Sponsor | Current fit | Next step |
| --- | --- | --- |
| Federato | Intake, review queue, sample guideline checks, human decision | Integrate the provided submissions API, schema discovery, and actual sample appetite guidelines when available |
| Rox / OpenAI | Handles broker text, missing fields, durable follow-up, optional OpenAI extraction | Demonstrate messy/conflicting records and evidence-backed actions with real sample data |
| Browserbase | Optional public-source browser activity with source URL and excerpt | Configure API key and show a live cited source in the demo |
| Sentry | Optional worker monitoring | Configure DSN and verify a test event in the dashboard |
| Tiger Data | PostgreSQL schema is compatible | Use a Tiger Data instance for event analytics if credentials are supplied |
| Gemini / ElevenLabs | No integration yet | Add a distinct model-validation or spoken-brief workflow only if it improves review |
| Composio / Linq | No integration yet | Connect an authorized broker follow-up channel with consent and audit trail |
| Expo / MongoDB Atlas / Cloudflare Agents SDK / GoDaddy | No integration yet | Consider only where a real mobile, data, deployment, or domain need emerges |
| Solana badge / personal lookup | Outside product scope | Do not use personal social data to infer insurance risk |

## Production work

Add authentication and role-based authorization, tenant isolation, approved model/data handling, document OCR and malware scanning, encrypted object storage, notification delivery, versioned real underwriting rules, and a Federato integration authorized by the customer. The current app deliberately does not quote, bind, or send broker messages.
