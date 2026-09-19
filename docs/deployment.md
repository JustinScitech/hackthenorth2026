# Demo deployment: Vercel + Render

The Next.js app includes the HTTP API. Deploy it as one Vercel project. The Temporal worker is a separate, continuously running process on Render. Both connect to the same Temporal namespace, PostgreSQL database, and MongoDB database. Do not deploy the local `compose.yaml` stack as production infrastructure.

## Before deploying

1. Merge the deployment PR into `main` before deploying. It also brings the agent-quality changes from PR #13 onto `main`. Use the same commit for Vercel and Render.
2. Provision a managed PostgreSQL database for case, audit, eval, and auth tables; a MongoDB Atlas database for submission documents; and a Temporal Cloud namespace with API-key authentication. Set network access so both hosts can reach the databases. The Render pre-deploy command runs the PostgreSQL migration.
3. Rotate credentials shared in chat or screenshots. Store new values only in the hosting providers' secret settings, not in the repository or `NEXT_PUBLIC_` variables.
4. Keep submissions fictional. Authentication currently uses an email allowlist, but the workspace lacks tenant isolation and role-based authorization, and the core underwriting rules are demo rules.

## Render worker

In Render, create a Blueprint from this repository's `render.yaml`. It creates the `astra-risk-agent` background worker, installs dependencies, checks configuration, runs `npm run db:migrate` before deploy, then starts `npm run worker`. A background worker is required: it must keep polling Temporal while the web app is idle. Render prompts for these variables during the initial Blueprint setup:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Hosted PostgreSQL connection string for the **app** database (not Temporal's internal database). |
| `MONGODB_URI` | Atlas connection string; URL-encode reserved characters in the password. |
| `TEMPORAL_ADDRESS` | Temporal Cloud Namespace endpoint, for example `<namespace>.<account>.tmprl.cloud:7233`. |
| `TEMPORAL_NAMESPACE` | Exact Namespace ID, for example `<namespace>.<account>`. |
| `TEMPORAL_API_KEY` | Namespace-scoped API key for the worker. |
| `GEMINI_API_KEY` | Model key required by this Render deployment to avoid parser-only analysis. |

The Blueprint sets `MONGODB_DB=underwriting_agent` and Node.js 22.22.0. Change the database name in Render if your Atlas database differs. Add `BROWSERBASE_API_KEY` and `SENTRY_DSN` to the worker only when those integrations are wanted. Existing Blueprints do not re-prompt for newly added `sync: false` variables; edit the Render service's environment settings instead.

Wait for the pre-deploy migration and for the worker log `Worker listening on underwriting-cases` before testing the website. If PostgreSQL reports a certificate-chain error, obtain the provider's correct CA or connection configuration; do not turn off TLS verification.

## Vercel web app and API

Your teammate can import the same repository and commit into one Vercel Next.js project. Set these server-side environment variables in Vercel Production:

| Variable | Value |
| --- | --- |
| `DATABASE_URL`, `MONGODB_URI`, `MONGODB_DB` | Same app databases used by Render. Use a pooled PostgreSQL endpoint if the provider offers one for serverless connections. |
| `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_API_KEY` | Same Temporal Cloud namespace; a separate scoped API key is preferable for the web API. |
| `BETTER_AUTH_URL` | Exact public HTTPS origin, with no trailing slash. |
| `BETTER_AUTH_SECRET` | A new random production secret; keep it stable across deploys. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Production Google OAuth Web client credentials. |
| `AUTH_ALLOWED_EMAILS` | Comma-separated approved Google addresses. |

Optional Vercel-side integrations: `FEDERATO_CLIENT_ID` and `FEDERATO_CLIENT_SECRET` for live triage; `ELEVENLABS_API_KEY` for audio briefs. Do not put worker-only model or sponsor keys into Vercel unless a web route actually needs them.

In Google Cloud, register `https://<your-domain>/api/auth/callback/google` as an authorized redirect URI for the production OAuth client. If the consent screen is in Testing mode, add each approved address to its test users too. Update `BETTER_AUTH_URL` and Google's redirect URI together if the domain changes. Local `localhost:3003` credentials do not automatically configure production.

## Smoke test

1. Open `/sign-in` at the production origin and complete Google sign-in with an approved test user.
2. Create a fictional sample submission. It should move past `received` and show extraction and guideline-check audit entries.
3. Check that the case trace identifies a completed Gemini extraction, not a parser fallback. If it stalls, inspect Render worker logs and the Temporal namespace's task queue pollers.
4. Complete a broker follow-up and underwriter decision, then confirm the case and Overview metrics update.

The web app starts and signals workflows; only the Render worker executes agent activities. A healthy Vercel deploy with a stopped worker can accept a case but will not analyze it.
