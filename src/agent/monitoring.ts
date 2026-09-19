import * as Sentry from "@sentry/node";

export function initMonitoring() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) delete event.request;
      return event;
    },
  });
}

export function captureAgentError(error: unknown) {
  if (process.env.SENTRY_DSN) Sentry.captureMessage(`Agent error: ${error instanceof Error ? error.name : "UnknownError"}`);
}
