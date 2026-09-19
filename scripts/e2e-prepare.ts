import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { E2E_DB_NAME, e2eEnvironment } from "./e2e-env";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for E2E tests");
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [E2E_DB_NAME]);
    if (!existing.rowCount) await admin.query(`CREATE DATABASE ${E2E_DB_NAME}`);
  } finally {
    await admin.end();
  }

  const migration = spawnSync(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], {
    env: e2eEnvironment(), stdio: "inherit",
  });
  if (migration.status !== 0) process.exitCode = migration.status ?? 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
