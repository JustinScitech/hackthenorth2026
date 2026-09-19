// Sentry for the Next.js Edge runtime. This app has no edge routes today, but Next.js
// still calls register() for the edge runtime, so keep the init inexpensive and PII-free.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.2),
  sendDefaultPii: false,
  initialScope: { tags: { process: "edge" } },
});
