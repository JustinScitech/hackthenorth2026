"use client";

import { Check, CircleNotch, ListChecks } from "@phosphor-icons/react/dist/ssr";
import type { ReviewProgress } from "@/lib/review-stream";

/** One activity surface for a live Federato run and a durable case job. */
export function ReviewActivity({ events, working }: { events: ReviewProgress[]; working: boolean }) {
  const latest = events.at(-1);
  return <section className="review-activity" role={working ? "status" : undefined} aria-label="Agent activity" aria-live="polite">
    <div className="review-activity-heading">
      {working ? <CircleNotch size={17} className="review-activity-spinner" aria-hidden="true" /> : <ListChecks size={17} aria-hidden="true" />}
      <strong>{latest?.message ?? (working ? "Starting review" : "Review ready")}</strong>
      {latest?.current !== undefined && latest.total !== undefined && <span className="count">{latest.current}/{latest.total}</span>}
    </div>
    {latest?.detail && <p className="subtle">{latest.detail}</p>}
    {events.length > 1 && <ol className="review-activity-steps">
      {events.slice(-6).map((event) => <li key={event.id ?? `${event.stage}:${event.current ?? ""}:${event.message}`}>
        <Check size={13} aria-hidden="true" />
        <span>{event.message}{event.current !== undefined && event.total !== undefined ? ` · ${event.current}/${event.total}` : ""}</span>
      </li>)}
    </ol>}
  </section>;
}
