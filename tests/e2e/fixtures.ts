import { createHmac, randomUUID } from "node:crypto";
import { test as base, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { e2eDatabaseUrl } from "../../scripts/e2e-env";

type CaseStatus = "received" | "extracting" | "checking" | "waiting_for_broker" | "review_ready" | "approved" | "declined" | "failed";
type Fixtures = {
  authenticatedPage: Page;
  seedCase: (options?: { insuredName?: string; status?: CaseStatus }) => Promise<string>;
  seedEvalRun: (passed: number, total: number) => Promise<void>;
};

async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try { return await run(client); }
  finally { await client.end(); }
}

export const test = base.extend<Fixtures>({
  authenticatedPage: async ({ page }, use) => {
    const userId = "e2e-reviewer";
    const sessionId = randomUUID();
    const token = randomUUID();
    await withDatabase(async (db) => {
      await db.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
        VALUES ($1, 'E2E Reviewer', 'reviewer@e2e.example', true, now(), now()) ON CONFLICT (id) DO NOTHING`, [userId]);
      await db.query(`INSERT INTO "session" (id, token, "userId", "expiresAt", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, now() + interval '1 hour', now(), now())`, [sessionId, token, userId]);
    });
    const secret = "e2e-only-secret-do-not-use-in-production-2026";
    const signature = createHmac("sha256", secret).update(token).digest("base64");
    await page.context().addCookies([{ name: "better-auth.session_token", value: `${token}.${signature}`, url: "http://localhost:3100", httpOnly: true, sameSite: "Lax" }]);
    try { await use(page); }
    finally { await withDatabase((db) => db.query('DELETE FROM "session" WHERE id = $1', [sessionId]).then(() => undefined)); }
  },
  seedCase: async ({}, use) => {
    const ids: string[] = [];
    await use(async (options = {}) => {
      const id = randomUUID();
      ids.push(id);
      await withDatabase((db) => db.query(`INSERT INTO cases (id, insured_name, state, tiv, year_built, losses, source_key, status)
        VALUES ($1, $2, 'CO', 3200000, 2008, 0, $3, $4)`,
      [id, options.insuredName ?? `E2E Fabrication ${id.slice(0, 8)}`, `e2e/${id}.txt`, options.status ?? "review_ready"]).then(() => undefined));
      return id;
    });
    await withDatabase(async (db) => {
      for (const id of ids) {
        await db.query("DELETE FROM case_jobs WHERE case_id = $1", [id]);
        await db.query("DELETE FROM case_actions WHERE case_id = $1", [id]);
        await db.query("DELETE FROM audit_events WHERE case_id = $1", [id]);
        await db.query("DELETE FROM cases WHERE id = $1", [id]);
      }
    });
  },
  seedEvalRun: async ({}, use) => {
    const ids: string[] = [];
    await use(async (passed, total) => {
      const id = randomUUID();
      ids.push(id);
      await withDatabase((db) => db.query(
        "INSERT INTO agent_eval_runs (id, passed, total, duration_ms, model, created_at) VALUES ($1, $2, $3, 1200, 'fixture-model', now() + interval '1 second')",
        [id, passed, total],
      ).then(() => undefined));
    });
    await withDatabase(async (db) => {
      for (const id of ids) await db.query("DELETE FROM agent_eval_runs WHERE id = $1", [id]);
    });
  },
});

export { expect };
