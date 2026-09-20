import { agentErrorMessage, monitorActivities, redactForLog, scrubEvent } from "../../src/agent/monitoring";
import { attempt, attemptAsync, type CaseResult, type Suite } from "../runner";

/**
 * Sentry track: observability that never leaks a submission. Every event,
 * log line, and span the worker emits must carry identifiers, counts, and
 * statuses only. These cases pin the scrubbing that makes that true.
 */
const brokerText = "Commercial property submission for Harbor Office LLC. Built in 2005, no losses.";

export const telemetrySuite: Suite = {
  name: "telemetry",
  description: "Sentry privacy: error events, logs, and spans carry no submission text",
  async run() {
    const results: CaseResult[] = [];
    results.push(attempt("error message never includes the thrown message", () => {
      const message = agentErrorMessage(new Error(`Source document ${brokerText} is missing`));
      return [message.includes(brokerText) || message.includes("Source document") ? `leaks: ${message}` : "", message.includes("Error") ? "" : "should name the error class"].filter(Boolean);
    }, "Error messages routinely embed the text that caused them."));
    results.push(attempt("non-error throwables are classified without their content", () => {
      const message = agentErrorMessage(brokerText);
      return [message.includes("Harbor") ? `leaks: ${message}` : "", /UnknownError/.test(message) ? "" : "should say UnknownError"].filter(Boolean);
    }));
    results.push(attempt("event scrubbing drops request bodies and free text", () => {
      const event = scrubEvent({ message: "Agent error: Error", request: { data: brokerText }, extra: { brokerNotes: brokerText, caseId: "abc", attempts: 2 }, contexts: { response: { text: brokerText } }, tags: { model: "gemini-3.8-flash" } } as Record<string, unknown>);
      const serialized = JSON.stringify(event);
      return [serialized.includes("Harbor") ? "submission text survived scrubbing" : "", "request" in event ? "request must be removed" : "", serialized.includes("gemini-3.8-flash") ? "" : "safe tags must survive", serialized.includes("abc") ? "" : "identifiers must survive"].filter(Boolean);
    }));
    results.push(attempt("log attributes keep ids, numbers, booleans, and short enums only", () => {
      const attributes = redactForLog({ caseId: "8c1f", revision: 2, status: "review_ready", exhausted: false, reason: brokerText, response: brokerText, missing: ["yearBuilt", "losses"], attempts: [{ model: "x" }], model: "gemini-3.8-flash" });
      const serialized = JSON.stringify(attributes);
      return [serialized.includes("Harbor") ? "free text survived" : "", attributes.caseId === "8c1f" && attributes.revision === 2 && attributes.status === "review_ready" && attributes.exhausted === false ? "" : `safe fields changed: ${serialized}`, attributes.missing === "yearBuilt,losses" || attributes.missing === 2 ? "" : `list should become a count or joined keys, got ${JSON.stringify(attributes.missing)}`, Object.values(attributes).every((value) => ["string", "number", "boolean"].includes(typeof value)) ? "" : "attributes must be scalars"].filter(Boolean);
    }, "Sentry Logs attributes are searchable; free text there would be a leak."));
    results.push(await attemptAsync("monitored activities keep their result and rethrow failures", async () => {
      const previous = process.env.SENTRY_DSN;
      process.env.SENTRY_DSN = "https://public@example.ingest.sentry.io/1";
      try {
        const wrapped = monitorActivities({ ok: async (value: number) => value * 2, fail: async () => { throw new Error("boom"); } });
        const problems: string[] = [];
        if (await wrapped.ok(21) !== 42) problems.push("wrapped activity changed its result");
        let threw = false;
        try { await wrapped.fail(); } catch (error) { threw = error instanceof Error && error.message === "boom"; }
        if (!threw) problems.push("failure must propagate unchanged");
        return problems;
      } finally {
        if (previous === undefined) delete process.env.SENTRY_DSN; else process.env.SENTRY_DSN = previous;
      }
    }));
    return results;
  },
};
