# Underwriting review agent

A durable, human-reviewed commercial property underwriting demo. PostgreSQL queues each case for a worker that extracts facts from a broker submission, checks sample guidelines, pauses for missing information, and resumes when a broker response arrives. An underwriter makes the final review decision.

Cases and Federato triage share the supplied **2025 sample appetite guidelines** and the same eight-factor scorer. Both support human review and must not be used to bind coverage automatically.

## Federato challenge triage

Open `/triage` and select **Rank live submissions**, or run `npm run triage`. Set `FEDERATO_CLIENT_ID` and `FEDERATO_CLIENT_SECRET` in `.env` to enable this live integration. The agent discovers the live schema, builds reference-aware queries, paginates the selected resource, and ranks records with factor-level explanations. This flow runs independently of the local case database.

The live planner prefers `Submission` and supplements missing evidence only from a uniquely linked Policy with matching insured, line, and effective date. Unmatched, ambiguous, and incomplete submissions remain visible. All lifecycle statuses are included and displayed. See [the challenge gap assessment](docs/federato-gap-assessment.md) for implemented requirements, scoring assumptions, configuration, live verification, and remaining gaps.

## Quoting assistant

`/quote` is a public, conversational tenant and car insurance estimator built for the Intact challenge. It reads a plain-language request, shows an estimate from the facts it has, and explains every remaining question. Every conversation is saved (facts only, never the text) and appears under **Quotes** in the workspace, so an advisor can pick up referrals. See [docs/quoting.md](docs/quoting.md) for the problem, how AI is used, the journey, and the assumptions. Demo rate tables only; nothing binds coverage.

## Interface

The product is branded **Astra Risk**; the logo files live in `public/brand`. The site has a marketing homepage at `/`, in-site docs and an API reference at `/docs`, and the workspace under `/overview`, `/cases`, `/cases/new`, `/quotes`, `/triage`, and `/settings`. The UI follows the documentation-style design system in [docs/DESIGN.md](docs/DESIGN.md): a sidebar plus content layout, cool-green surfaces, translucent green annotations, and a small shadow hierarchy. Dark mode is the default; switch to light in **Settings** or with the sun/moon button in the header. The choice is saved in the browser.

## Stack

- Next.js: case intake, progress, review, and API
- PostgreSQL or Tiger Data: case records, durable jobs, retries, and audit events
- MongoDB: broker submissions, replies, and public evidence (local container or Atlas)
- Optional Gemini and OpenAI APIs: independent structured extraction from unstructured broker notes, resolved by agreement with a deterministic parser; the parser alone works without keys
- Optional Browserbase: visit an explicitly supplied public source, read year built, construction, size, sprinklers, and flood zone from the page, and turn each into a cited finding that corroborates, contradicts, or adds to the broker facts
- Optional Sentry: error monitoring, agent traces, structured logs, per-model-call AI spans, and job, analysis, and eval metrics from the worker, web app, and browser, read back into the overview dashboard; every event is scrubbed of submission text
- Optional ElevenLabs: spoken underwriter review brief

## Code layout

- `src/agent/jobs.ts`: PostgreSQL job queue, retries, leases, and scheduled broker follow-ups
- `src/agent/activities.ts`: retryable I/O and idempotent case/audit transitions
- `src/agent/analysis.ts` and `model.ts`: shared carrier appetite checks, Gemini extraction, deterministic fallback, and conflict detection
- `src/agent/public-source.ts`: bounded Browserbase evidence capture; public URL validation is separate
- `src/agent/worker.ts`: continuously running job worker
- `src/lib`: shared case types, PostgreSQL access, and MongoDB documents
- `src/app`: web UI and HTTP endpoints; it does not execute agent activities

## Run locally

For a single-VM demo deployment without paid workflow hosting, follow [the deployment checklist](docs/deployment.md). The web API and worker are separate processes connected to the same PostgreSQL and MongoDB instances.

1. Start Docker Desktop.
2. Copy `.env.example` to `.env` if needed, then adjust values. Keep it out of Git. Google sign-in requires `BETTER_AUTH_URL`, a random `BETTER_AUTH_SECRET`, Google OAuth client ID/secret, and a comma-separated `AUTH_ALLOWED_EMAILS`. Without them, the workspace remains locked.
3. Run `docker compose up -d`.
4. Run `npm install` and `npm run db:migrate`.
5. In one terminal, run `npm run worker`.
6. In another terminal, run `npm run dev` and open http://localhost:3003.

The core demo needs no sponsor API keys.

For local Google OAuth, register `http://localhost:3003/api/auth/callback/google` as an authorized redirect URI (use your actual dev-server port if different) and set `BETTER_AUTH_URL` to the matching origin. In production, register `https://your-domain/api/auth/callback/google`. Run `npm run db:migrate` after deploying to create the auth tables. Approved Google accounts share the demo workspace; this is authentication and an email allowlist, not tenant isolation or role-based authorization. Do not use real insurance submissions until those controls are added.

If **Continue with Google** is disabled, check `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_ALLOWED_EMAILS`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` in the server environment, then restart the web server. Database, MongoDB, and sponsor API keys do not substitute for a Google OAuth web client. The Google Cloud consent screen and the exact callback URL must also be configured there.

MongoDB starts with `docker compose up -d` and is the only document store. For the Atlas prize, use an actual Atlas connection string instead; a local container is only a development substitute. `DATABASE_URL` can point to a Tiger Data PostgreSQL instance for case/audit state, but merely changing the hostname does not establish prize eligibility.

Set only the integrations you want in `.env` (see `.env.sponsors.example`): `BROWSERBASE_API_KEY` enables public-source visits, `SENTRY_DSN` enables worker monitoring, `GEMINI_API_KEY` enables an independent extraction check, and `ELEVENLABS_API_KEY` enables audio briefs. All are optional. The public-source field accepts an explicit HTTPS URL; it does not discover or profile people. External page text is displayed as evidence, not treated as a verified underwriting fact or used to approve coverage.

The **Agent quality** section on `/overview` uses local PostgreSQL case and audit data for 30-day outcomes, extraction source counts, and average time to the first guideline check. `npm run eval:agent` writes its latest aggregate result to `agent_eval_runs`; run `npm run db:migrate` after updating before using the dashboard. With `SENTRY_DSN` configured, the worker also emits extraction, model-duration, analysis-outcome, decision, and job metrics to Sentry, traces each job and activity as a span, and `npm run eval:agent` reports per-run and per-fixture eval metrics. With `SENTRY_AUTH_TOKEN` (plus `SENTRY_ORG` and `SENTRY_PROJECT`) the same page adds a **Sentry telemetry** panel that reads those errors, spans, and metrics back from the Sentry API on the server, caches them for a minute, and never sends the token to the browser. Without the token, the panel explains what to set and the local metrics still work. Do not store raw submission text in telemetry.

Atlas and TigerData connection strings can be kept as optional local variables, but the app uses `MONGODB_URI` and `DATABASE_URL` until you deliberately point those at hosted services. Do not run tests or migrations against hosted databases unintentionally. Linq messaging, Elasticsearch search, and a custom domain are not enabled by credentials alone; configure an explicit workflow, endpoint, or owned domain before using them. Keep all credentials in ignored local environment files or your deployment secret store, never in a PR.

## Durable case lifecycle

`received -> extracting -> checking -> waiting_for_broker (optional) -> review_ready -> approved/declined`

Case work is queued in PostgreSQL. Broker responses and underwriter decisions are persisted before the worker processes them, so a stopped worker can resume after restart. A scheduled job records when a 24-hour broker follow-up is due; it does not send a message. Jobs retry with backoff and expired leases can be reclaimed. Changes to an existing submission should create a new case version in a production integration.

The case view shows a persisted activity trace: intake, extraction sources, public research, guideline counts, broker follow-ups, and review actions. It does not display or store a model's private chain-of-thought. The live Federato triage endpoint is currently a separate synchronous request; move it into bounded jobs before treating it as a durable long-running process.

## Sentry

Sentry is wired for all three runtimes. `src/instrumentation.ts` loads `sentry.server.config.ts` and `sentry.edge.config.ts` and forwards Next.js request errors; `src/instrumentation-client.ts` initializes the browser SDK and traces App Router navigations; `src/app/global-error.tsx` reports root layout crashes; and `next.config.ts` wraps the build with `withSentryConfig`, which uploads source maps only when `SENTRY_AUTH_TOKEN` is set. The worker and eval script use `@sentry/node` directly in `src/agent/monitoring.ts`, tagged `process=worker` or `process=eval`, so everything lands in one project.

Telemetry is privacy-minimized: request bodies, headers, and cookies are dropped, `sendDefaultPii` is off, agent errors are reported by error name only, and metrics carry attributes such as `source`, `outcome`, `status`, `kind`, `model`, and `fixture`, never broker text. The metric names are `underwriting.extraction`, `underwriting.model_duration`, `underwriting.analysis`, `underwriting.referrals`, `underwriting.decision`, `underwriting.job`, `underwriting.job_duration`, `underwriting.eval_accuracy`, `underwriting.eval_run`, `underwriting.eval_duration`, `underwriting.eval_case`, and `underwriting.eval_case_duration`; spans use the ops `agent.job`, `agent.activity`, `agent.eval`, and `agent.eval.case`.

Set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` to the project DSN and `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` for source maps and the dashboard panel. `./scripts/vercel-env.sh` pushes all five to Vercel. The Docker image needs `NEXT_PUBLIC_SENTRY_DSN` as a build argument because the browser DSN is inlined at build time; `compose.production.yaml` passes it from `.env.production`. Sentry's Claude Code plugin (`npx @sentry/agent-plugin install <org>#<code>`) is installed per developer machine, not in the repo.

## Deploying to Vercel

The recommended low-cost demo runs the web app and worker together on one VM; see [the deployment checklist](docs/deployment.md). Vercel can host the web app separately only if the worker reaches the same hosted PostgreSQL and MongoDB databases. The app resolves databases from where it runs (`src/lib/env.ts`): locally it uses `DATABASE_URL` and `MONGODB_URI`, and on Vercel it uses `TIGERDATA_DATABASE_URL` and `MONGODB_ATLAS_URI`, refusing localhost. `./scripts/vercel-env.sh` can push variables to a linked Vercel project. `.vercelignore` keeps `.env` out of uploads; never rely on `.gitignore` for that. Vercel Hobby is limited to personal, non-commercial use.

## Google sign-in troubleshooting

A `redirect_uri_mismatch` from Google means the OAuth client does not list the exact callback the app sends. Run `npm run auth:check` to have Google report which candidate URIs are registered on the configured client; the two ending in `/api/auth/callback/google` must be marked as registered. Pass `--client <id>` to inspect a different client.

## Checks

Run `npm run typecheck`, `npm test`, and `npm run build`. `npm test` includes the offline agent evals in [evals/](evals/README.md): 189 cases across extraction, multi-source resolution, appetite review of cases, case journeys, public-source enrichment, Federato appetite scoring, queue ranking, quoting, and telemetry privacy, with a baseline ratchet that fails the build on any regression; `npm run eval` prints the scorecard. For browser regression tests, start the local stack with `docker compose up -d`, then run `npm run test:e2e`. The command creates and migrates a separate `underwriting_agent_e2e` database, builds the app, and starts a temporary server and worker on port 3100. Most UI scenarios use fixture responses; one exercises the real PostgreSQL job and MongoDB lifecycle. Google, Gemini, and sponsor credentials are not needed, and the normal case database is untouched. On macOS it uses installed Google Chrome; elsewhere install Playwright Chromium with `npx playwright install chromium`.

Run `npm run eval:underwriting` for the offline, versioned Federato appetite corpus. It checks every factor and writes a detailed report under ignored `data/`. For a live Gemini extraction eval, set `GEMINI_API_KEY` and run `npm run eval:agent`. It checks the model's year-built and three-year loss-count values, selected provenance, and exact carrier appetite findings across synthetic broker notes and any samples added under `evals/agent-notes/`. Calls are spaced to reduce per-minute rate-limit errors. The live eval fails if Gemini is unavailable or falls back to the parser. These text-based evals do not measure PDF ingestion or coverage decisions. See [the evaluation guide](docs/underwriting-evals.md) for adding PDF-grounded cases.

The case page shows job state and a persisted activity trace with model name, extraction time, and fallback status. Gemini extraction tries `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, then `gemini-3.5-flash`, stopping at the first valid result. `GEMINI_MODEL` can put a different model first for comparison. Quota and authentication errors stop the waterfall rather than multiplying requests. Cases apply all eight carrier checks deterministically after extraction. Claim counts are context only; explicit five-year dollar loss evidence is required. Run `npm run db:migrate` before starting the updated web app and worker to add the appetite input and score columns. Existing saved analyses remain labeled legacy; create a new review to score those risks under the carrier rules.

## Sponsor fit and remaining work

See [the sponsor integration map](docs/sponsor-map.md) for every item from the team brief and [the Federato gap assessment](docs/federato-gap-assessment.md) for the live triage implementation. Prize eligibility depends on this year's published rules and an actual configured, demonstrable integration, not a placeholder or package dependency.

## Production work

Add authentication and role-based authorization, tenant isolation, approved model/data handling, document OCR and malware scanning, encrypted document storage, notification delivery, versioned real underwriting rules, and a Federato integration authorized by the customer. The current app deliberately does not quote, bind, or send broker messages.
