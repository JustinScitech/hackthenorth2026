"use client";

import Link from "next/link";
import { nextStep } from "@/federato/disposition";
import type { RankedSubmission } from "@/federato/scoring";
import type { CaseOrigin } from "@/lib/types";
import { dispositionSlug } from "./queue";

/** Where a case stands against the appetite, in the same four fields the queue uses. */
export function NextStepPanel({ result, origin }: { result: RankedSubmission; origin?: CaseOrigin | null }) {
  const step = nextStep(result);
  return <section className="detail-section next-step" aria-label="Where this stands">
    <div className="section-heading"><h2>Where this stands</h2><span className={`disposition disposition-${dispositionSlug[step.disposition]}`}>{step.disposition}</span></div>
    <p>{step.why}</p>
    <p><strong>Next:</strong> {step.action}</p>
    {step.questions.length > 0 && <ul className="queue-questions">{step.questions.map((question) => <li key={question.item}><strong>{question.item}</strong>: {question.source}</li>)}</ul>}
    {origin && <p className="subtle">Ranked {origin.rank} of {origin.of} in the Federato queue · <Link className="text-link" href="/triage">back to the queue</Link></p>}
  </section>;
}
