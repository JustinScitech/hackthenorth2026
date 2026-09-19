# Underwriting review agent

A durable, human-reviewed commercial property underwriting demo. Each case runs as a Temporal workflow. The worker extracts facts from a broker submission, checks sample guidelines, pauses for missing information, and resumes when a broker response arrives. An underwriter makes the final review decision.

The guideline thresholds in this repository are **fictional demo rules** and must not be used to make real insurance decisions.

## Stack

- Next.js: case intake, progress, review, and API
- Temporal: durable workflow, retries, broker/underwriter signals
- PostgreSQL: case records and audit events
- MinIO: original broker submission text (S3-compatible object storage)
- Optional OpenAI API: structured extraction from unstructured broker notes; deterministic fallback works without a key

## Run locally

1. Start Docker Desktop.
2. Copy `.env.example` to `.env.local` and adjust values if necessary.
3. Run `docker compose up -d`.
4. Run `npm install` and `npm run db:migrate`.
5. In one terminal, run `npm run worker`.
6. In another terminal, run `npm run dev` and open http://localhost:3000.

Temporal UI is at http://localhost:8080 and MinIO console is at http://localhost:9001. The demo does not require an OpenAI key.

## Durable case lifecycle

`received -> extracting -> checking -> waiting_for_broker (optional) -> review_ready -> approved/declined`

The case ID is the Temporal workflow ID. A broker response and an underwriter decision are durable signals, so a stopped worker can resume after restart. A durable 24-hour timer records when broker follow-up is due; it does not send a message. Activities are bounded and retryable. Submissions and audit data are stored outside workflow history; the workflow passes IDs and small typed results. Changes to an existing submission should create a new case version in a production integration.

## Checks

Run `npm run typecheck`, `npm test`, and `npm run build`.

## Production work

Add authentication and role-based authorization, tenant isolation, approved model/data handling, document OCR and malware scanning, encrypted object storage, notification delivery, versioned real underwriting rules, and a Federato integration authorized by the customer. The current app deliberately does not quote, bind, or send broker messages.
