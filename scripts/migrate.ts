import { Pool } from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  await pool.query(`
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
    ALTER TABLE cases ADD COLUMN IF NOT EXISTS public_source_url text;
    ALTER TABLE cases ADD COLUMN IF NOT EXISTS public_evidence jsonb;
  `);
  console.log("Database ready");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => pool.end());
