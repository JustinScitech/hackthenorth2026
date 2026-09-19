export const E2E_PORT = 3100;
export const E2E_DB_NAME = "underwriting_agent_e2e";

export function e2eDatabaseUrl() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for E2E tests");
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${E2E_DB_NAME}`;
  return url.toString();
}

export function e2eEnvironment() {
  return {
    ...process.env,
    DATABASE_URL: e2eDatabaseUrl(),
    MONGODB_DB: "underwriting_agent_e2e",
    TEMPORAL_TASK_QUEUE: "underwriting-cases-e2e",
    BETTER_AUTH_URL: `http://localhost:${E2E_PORT}`,
    BETTER_AUTH_SECRET: "e2e-only-secret-do-not-use-in-production-2026",
    AUTH_ALLOWED_EMAILS: "reviewer@e2e.example",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    GEMINI_API_KEY: "",
    OPENAI_API_KEY: "",
    BROWSERBASE_API_KEY: "",
    SENTRY_DSN: "",
    FEDERATO_API_KEY: "",
    FEDERATO_CLIENT_ID: "",
    FEDERATO_CLIENT_SECRET: "",
    ELEVENLABS_API_KEY: "",
  };
}
