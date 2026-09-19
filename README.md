# Underwriting review agent

A durable, human-reviewed commercial property underwriting demo. Each case runs as a Temporal workflow. The worker extracts facts from a broker submission, checks sample guidelines, pauses for missing information, and resumes when a broker response arrives. An underwriter makes the final review decision.

The original case-review workflow uses **fictional demo rules**. The separate Federato triage flow uses the supplied **2025 sample appetite guidelines**. Both support human review and must not be used to bind coverage automatically.

## Federato challenge triage

Open `/triage` and select **Rank live submissions**, or run `npm run triage`. Configure `FEDERATO_CLIENT_ID` and `FEDERATO_CLIENT_SECRET` in `.env.local`. The agent discovers the live schema, builds reference-aware queries, paginates the selected resource, and ranks records with factor-level explanations. This flow runs independently of the local database and Temporal stack.

The live schema currently selects `Policy` because it contains more appetite fields; the report explicitly identifies that scope. It is not yet a reconciled queue of standalone Submission records. See [the challenge gap assessment](docs/federato-gap-assessment.md) for implemented requirements, scoring assumptions, configuration, live verification, and remaining gaps.

## Stack

- Next.js: case intake, progress, review, and API
- Temporal: durable workflow, retries, broker/underwriter signals
- PostgreSQL or Tiger Data: case records and audit events; Temporal uses PostgreSQL separately
- MongoDB Atlas: broker submissions, replies, and public evidence when configured
- MinIO: local fallback and legacy broker text (S3-compatible object storage)
- Optional OpenAI API: structured extraction from unstructured broker notes; deterministic fallback works without a key
- Optional Gemini API: independent extraction and contradiction checks
- Optional Browserbase: visit an explicitly supplied public source and attach a cited excerpt to the case
- Optional Sentry: privacy-minimized worker error monitoring
- Optional ElevenLabs: spoken underwriter review brief

## Code layout

- `src/agent/workflows.ts`: deterministic Temporal orchestration, signals, durable waits, and history rotation
- `src/agent/activities.ts`: retryable I/O and idempotent case/audit transitions
- `src/agent/analysis.ts` and `model.ts`: fictional guideline checks, dual-model extraction, and conflict detection
- `src/agent/public-source.ts`: bounded Browserbase evidence capture; public URL validation is separate
- `src/agent/contracts.ts`, `client.ts`, and `worker.ts`: shared Temporal names, API client, and worker process
- `src/lib`: shared case types, PostgreSQL access, MongoDB documents, and S3 fallback
- `src/app`: web UI and HTTP endpoints; it does not execute agent activities

## Run locally

1. Start Docker Desktop.
2. Copy `.env.example` to `.env.local` and adjust values if necessary.
3. Run `docker compose up -d`.
4. Run `npm install` and `npm run db:migrate`.
5. In one terminal, run `npm run worker`.
6. In another terminal, run `npm run dev` and open http://localhost:3000.

Temporal UI is at http://localhost:8080 and MinIO console is at http://localhost:9001. The demo does not require an OpenAI key.

For local MongoDB, run `docker compose --profile mongo up -d mongo` and set `MONGODB_URI=mongodb://localhost:27017` in `.env.local` before starting both the web app and worker. For the Atlas prize, use an actual Atlas connection string instead; a local container is only a development substitute. New broker text goes to MongoDB when configured, while existing MinIO objects remain readable. `DATABASE_URL` can point to a Tiger Data PostgreSQL instance for case/audit state, but merely changing the hostname does not establish prize eligibility.

Set `BROWSERBASE_API_KEY` to enable public-source visits, `SENTRY_DSN` to enable worker monitoring, `GEMINI_API_KEY` for an independent extraction check, and `ELEVENLABS_API_KEY` for audio briefs. All are optional. The public-source field accepts an explicit HTTPS URL; it does not discover or profile people. External page text is displayed as evidence, not treated as a verified underwriting fact or used to approve coverage.

## Durable case lifecycle

`received -> extracting -> checking -> waiting_for_broker (optional) -> review_ready -> approved/declined`

The case ID is the Temporal workflow ID. A broker response and an underwriter decision are durable signals, so a stopped worker can resume after restart. A durable 24-hour timer records when broker follow-up is due; it does not send a message. Activities are bounded and retryable. Submissions and audit data are stored outside workflow history; the workflow passes IDs and small typed results. When Temporal recommends it, the workflow continues as new with a small phase/follow-up checkpoint so long waits do not grow the execution history indefinitely. Changes to an existing submission should create a new case version in a production integration.

## Checks

Run `npm run typecheck`, `npm test`, and `npm run build`.

## Sponsor fit and remaining work

See [the sponsor integration map](docs/sponsor-map.md) for every item from the team brief and [the Federato gap assessment](docs/federato-gap-assessment.md) for the live triage implementation. Prize eligibility depends on this year's published rules and an actual configured, demonstrable integration, not a placeholder or package dependency.

## Production work

Add authentication and role-based authorization, tenant isolation, approved model/data handling, document OCR and malware scanning, encrypted object storage, notification delivery, versioned real underwriting rules, and a Federato integration authorized by the customer. The current app deliberately does not quote, bind, or send broker messages.
