import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "pdfjs-dist"],
  turbopack: { root: process.cwd() },
  // playwright-core resolves browsers.json through a computed path, so the file tracer misses it
  // and every function importing the job queue failed to load on Vercel. Include it explicitly.
  outputFileTracingIncludes: { "/*": ["./node_modules/playwright-core/browsers.json"] },
};

// Source maps upload only when SENTRY_AUTH_TOKEN is present (Vercel builds); local builds skip it silently.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || "astra-risk",
  project: process.env.SENTRY_PROJECT || "astra-risk",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
