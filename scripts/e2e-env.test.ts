import assert from "node:assert/strict";
import { test } from "node:test";
import { e2eDatabaseUrl, e2eEnvironment } from "./e2e-env";

test("E2E cannot target hosted storage", () => {
  const previous = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = "postgres://user:pass@prod.example.com/app";
    assert.throws(e2eDatabaseUrl, /local PostgreSQL/);

    process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:5432/app";
    const env = e2eEnvironment();
    assert.equal(new URL(env.DATABASE_URL).pathname, "/underwriting_agent_e2e");
    assert.equal(env.MONGODB_URI, "mongodb://127.0.0.1:27017");
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
