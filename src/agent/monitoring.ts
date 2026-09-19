import * as Sentry from "@sentry/node";

type Activity = (...args: unknown[]) => Promise<unknown>;

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

export function monitorActivities<T extends object>(activities: T): T {
  if (!process.env.SENTRY_DSN) return activities;
  return Object.fromEntries((Object.entries(activities) as [string, Activity][]).map(([name, activity]) => [
    name,
    (...args: unknown[]) => Sentry.startSpan({ name: `underwriting.${name}`, op: "agent.activity" }, async () => {
      try { return await activity(...args); }
      catch (error) { captureAgentError(error); throw error; }
    }),
  ])) as T;
}
