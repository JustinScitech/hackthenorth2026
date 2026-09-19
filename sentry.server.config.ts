// Sentry for the Next.js Node.js runtime (route handlers, server components, server actions).
// Loaded once per server instance from src/instrumentation.ts. The worker process has its own
// init in src/agent/monitoring.ts and reports to the same project under the "worker" tag.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.2),
  sendDefaultPii: false,
  initialScope: { tags: { process: "web" } },
  beforeSend(event) {
    // Broker submissions and auth cookies must never reach telemetry.
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      delete event.request.headers;
    }
    return event;
  },
});
