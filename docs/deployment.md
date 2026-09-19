# Single-VM demo deployment

The Next.js process serves both the frontend and HTTP API. A separate Node worker processes durable jobs from PostgreSQL. MongoDB stores broker text and evidence. `compose.production.yaml` runs all four processes, plus Caddy for HTTPS, on one VM. There is no Temporal or Render dependency.

This is a small fictional-data demo, not production insurance infrastructure. The app has an email allowlist but no tenant isolation or role-based authorization. Do not submit real customer documents. Rotate every credential previously shared in chat or screenshots.

## VM and DNS

1. Provision a Linux VM with at least 2 vCPUs and 8 GB RAM. Oracle Always Free Arm is one possible zero-cost demo host when capacity is available. Confirm that the VM has enough free storage for database volumes and Docker images.
2. Point a domain or subdomain you control at the VM's public IP. Allow inbound TCP 80 and 443, and UDP 443 for HTTPS. Restrict SSH to your own IP. Do not open PostgreSQL, MongoDB, or the worker to the internet.
3. Install Docker Engine and its Compose plugin on the VM. Clone this repository at the revision you want to deploy.
4. Copy `.env.production.example` to `.env.production`. Set `DOMAIN` and `BETTER_AUTH_URL` to the same public host, create fresh random `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET`, and use the same PostgreSQL password in `DATABASE_URL`. Set Google OAuth credentials and approved email addresses. Set `GEMINI_API_KEY` to enable model extraction; without it, the deterministic parser runs.
5. In Google Cloud, add `https://<your-domain>/api/auth/callback/google` as an authorized redirect URI for that OAuth client. Add approved accounts as test users while the consent screen is in Testing mode.

Keep `.env.production` on the VM only. It is ignored by Git and excluded from the Docker build context. The build uses inert placeholder values; Compose supplies real values at runtime.

## Deploy

Run these commands from the repository directory on the VM:

```sh
docker compose --env-file .env.production -f compose.production.yaml config --quiet
docker compose --env-file .env.production -f compose.production.yaml build migrate
docker compose --env-file .env.production -f compose.production.yaml run --no-deps --rm web npm run deploy:check
docker compose --env-file .env.production -f compose.production.yaml up -d
docker compose --env-file .env.production -f compose.production.yaml logs -f worker web caddy
```

Compose waits for PostgreSQL and MongoDB, runs the schema migration, then starts the web and worker services. Caddy obtains and renews the HTTPS certificate after DNS resolves. Deploy a new revision with `git pull`, then repeat `build migrate` and `up -d`. Keep PostgreSQL and MongoDB volumes intact during updates. `docker compose down -v` deletes case data.

## Smoke test

1. Open `https://<your-domain>/sign-in` and sign in with an approved Google account.
2. Create a fictional sample case. It should leave `received` and show extraction and guideline-check audit entries. If `GEMINI_API_KEY` is set, confirm the trace shows a completed Gemini attempt rather than parser fallback.
3. Use a sample that requires broker information. Add a response, wait for `review_ready`, then record an underwriter decision.
4. Restart only the worker with `docker compose --env-file .env.production -f compose.production.yaml restart worker`. Queued jobs should resume from PostgreSQL.

If work stalls, inspect worker logs and the `case_jobs` table. Jobs retry three times with backoff; a crashed worker's lease expires and another worker can reclaim the job. The 24-hour broker follow-up is an audit event, not a sent message.

## Limits and operations

This setup has a single VM and no automatic offsite backups, high availability, or disaster recovery. Back up the PostgreSQL and MongoDB volumes before using persistent data. Watch disk space, memory, certificate renewal, and free-tier limits. Treat the free VM as a demo host; do not promise availability or store regulated customer data on it.

The web server and worker must both be running. The web server can accept a case while the worker is stopped, but analysis will remain queued. Gemini and optional sponsor services have their own usage limits or charges independent of hosting.
