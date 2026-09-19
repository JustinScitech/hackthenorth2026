// Browser-side Sentry. Runs after the document loads and before hydration.
// The DSN is a public key by design; NEXT_PUBLIC_SENTRY_DSN is inlined at build time.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: 0.2,
  sendDefaultPii: false,
  initialScope: { tags: { process: "browser" } },
});

// App Router navigations become navigation spans and breadcrumbs.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
