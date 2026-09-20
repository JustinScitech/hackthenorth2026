"use client";

import Link from "next/link";
import { dispositionSlug, nextStep } from "@/federato/disposition";
import type { RankedSubmission } from "@/federato/scoring";
import type { CaseOrigin } from "@/lib/types";

/** Where a case stands against the appetite, in the same four fields the queue uses. */
export function NextStepPanel({ result, origin }: { result: RankedSubmission; origin?: CaseOrigin | null }) {
  const step = nextStep(result);
  return <section className="detail-section appetite-recommendation next-step" aria-label="Where this stands">
    <div className="section-heading"><h2>Where this stands</h2><span className={`disposition disposition-${dispositionSlug[step.disposition]}`}>{step.disposition}</span></div>
    <p>{step.why}</p>
    <p><strong>Next:</strong> {step.action}</p>
    {step.questions.length > 0 && <ul className="queue-questions">{step.questions.map((question) => <li key={question.item}><strong>{question.item}</strong>: {question.source}</li>)}</ul>}
    {(result.counterfactuals?.length ?? 0) > 0 && <div className="what-would-change"><h3>What would change it</h3><ul>{result.counterfactuals!.map((change) => <li key={change.concept}><strong>{change.factor}</strong><span>{change.condition}</span></li>)}</ul><p className="subtle">Appetite only, one factor at a time. The year built and loss history are facts of the risk, not requests to make.</p></div>}
    {origin && <p className="subtle">Ranked {origin.rank} of {origin.of} in the Federato queue · <Link className="text-link" href="/triage">back to the queue</Link></p>}
  </section>;
}
