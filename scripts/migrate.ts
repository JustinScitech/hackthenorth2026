import { getMigrations } from "better-auth/db/migration";
import { auth } from "../src/auth";
import { db } from "../src/lib/db";

async function main() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS cases (
      id uuid PRIMARY KEY,
      insured_name text NOT NULL,
      state text NOT NULL,
      tiv numeric NOT NULL,
      year_built integer,
      losses integer,
      source_key text NOT NULL,
      public_source_url text,
      public_evidence jsonb,
      extraction_conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
      status text NOT NULL DEFAULT 'received',
      facts jsonb,
      findings jsonb,
      brief text,
      question text,
      decision text,
      error text,
      analysis_revision integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id bigserial PRIMARY KEY,
      case_id uuid NOT NULL REFERENCES cases(id),
      event_type text NOT NULL,
      event_key text UNIQUE,
      detail jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS audit_events_case_id_idx ON audit_events(case_id, created_at);
    CREATE TABLE IF NOT EXISTS case_actions (
      id uuid PRIMARY KEY,
      case_id uuid NOT NULL REFERENCES cases(id),
      kind text NOT NULL CHECK (kind IN ('broker_response', 'approve', 'decline')),
      source_key text,
      reason text,
      processed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS case_actions_case_id_idx ON case_actions(case_id, created_at);
    CREATE TABLE IF NOT EXISTS case_jobs (
      id uuid PRIMARY KEY,
      case_id uuid NOT NULL REFERENCES cases(id),
      kind text NOT NULL CHECK (kind IN ('analyze', 'broker_response', 'decision', 'broker_follow_up')),
      job_key text NOT NULL UNIQUE,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
      attempts integer NOT NULL DEFAULT 0,
      run_at timestamptz NOT NULL DEFAULT now(),
      lease_until timestamptz,
      lease_token uuid,
      last_error text,
      finished_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS case_jobs_claim_idx ON case_jobs(run_at, created_at) WHERE finished_at IS NULL;
    CREATE INDEX IF NOT EXISTS case_jobs_case_id_idx ON case_jobs(case_id, created_at);
    CREATE TABLE IF NOT EXISTS agent_eval_runs (
      id uuid PRIMARY KEY,
      total integer NOT NULL,
      passed integer NOT NULL,
      duration_ms integer NOT NULL,
      model text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS quotes (
      id uuid PRIMARY KEY,
      product text CHECK (product IN ('tenant', 'auto')),
      status text NOT NULL CHECK (status IN ('choosing', 'needs_info', 'estimate', 'refer')),
      province text,
      estimate jsonb,
      heard jsonb NOT NULL DEFAULT '{}'::jsonb,
      open_questions integer NOT NULL DEFAULT 0,
      referral text,
      model text,
      turns integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS quotes_updated_at_idx ON quotes(updated_at DESC);
    ALTER TABLE cases ADD COLUMN IF NOT EXISTS public_source_url text;
    ALTER TABLE cases ADD COLUMN IF NOT EXISTS appetite jsonb;
    ALTER TABLE cases ADD COLUMN IF NOT EXISTS appetite_result jsonb;
    ALTER TABLE cases ADD COLUMN IF NOT EXISTS public_evidence jsonb;
    ALTER TABLE cases ADD COLUMN IF NOT EXISTS extraction_conflicts jsonb NOT NULL DEFAULT '[]'::jsonb;
  `);
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  console.log("Database ready");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.end());
