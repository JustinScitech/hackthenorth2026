"use client";

import { CheckCircle, Warning, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { RankedSubmission } from "@/federato/scoring";
import { summarizeSubmission } from "@/federato/presentation";
import { buildReviewPlan } from "@/federato/review-plan";

/** Shared appetite decision and evidence UI for local cases and Federato records. */
export function ReviewResult({ result, rank, label, embedded = false, defaultExpanded = false }: { result: RankedSubmission; rank?: number; label?: string; embedded?: boolean; defaultExpanded?: boolean }) {
  const summary = summarizeSubmission(result);
  const plan = buildReviewPlan(result);
  const Icon = summary.status === "positive" ? CheckCircle : summary.status === "refer" ? Warning : WarningCircle;
  return <section className={`review-result${embedded ? " is-embedded" : ""}`} aria-label="Appetite recommendation">
    {!embedded && <div className="review-result-heading">
      <h2>{rank !== undefined && <span className="rank" aria-label={`Rank ${rank}`}>{rank}</span>}{result.account}</h2>
      <p className="subtle">Match {result.rawScore}/100 · Priority {result.score}/100</p>
    </div>}
    {result.lifecycleStatus && <p className="subtle">Lifecycle status: {result.lifecycleStatus}. {result.evidenceNote}</p>}
    <div className={`decision-banner decision-${summary.status}`}><Icon size={18} aria-hidden="true" /><div><strong>{summary.title}</strong><span>{summary.plainExplanation}</span></div></div>
    <p className="next-action"><strong>Next step:</strong> {summary.action}</p>
    <div className="plain-facts">
      {summary.strengths.length > 0 && <div><strong>What supports this:</strong> {summary.strengths.join(", ")}</div>}
      {summary.questions.length > 0 && <div><strong>What to check:</strong> {summary.questions.join(", ")}</div>}
    </div>
    <details className="review-plan" open={defaultExpanded ? true : undefined}><summary>Review checklist · {plan.exceptions} exceptions · {plan.gaps} evidence gaps</summary>
      <div className="review-plan-body"><p className="subtle">{plan.assessed} of {plan.total} appetite factors can be assessed from supplied data. Confirm source accuracy before deciding.</p>
        {plan.tasks.length ? <ol>{plan.tasks.map((task) => <li key={`${task.kind}-${task.factor}`}><strong>{task.kind === "exception" ? "Refer" : "Clarify"}: {task.factor}</strong><p>{task.action}</p><details><summary>Evidence behind this task</summary><p>{task.reason}</p><p className="subtle">Source: {task.source ?? "Required context; no supporting field available"}</p></details></li>)}</ol> : <p>No unresolved appetite checks.</p>}
      </div>
    </details>
    <details open={defaultExpanded ? true : undefined}><summary>Appetite breakdown and data sources</summary><div className="triage-table-wrap"><table className="triage-table"><thead><tr><th>Factor</th><th>Result</th><th>Points</th><th>Evidence and rule</th></tr></thead><tbody>{result.criteria.map((criterion) => <tr key={criterion.factor}><th scope="row">{criterion.factor}</th><td>{criterion.status}</td><td>{criterion.points}/{criterion.maximum}</td><td>{criterion.detail}<small>Source: {criterion.source}</small></td></tr>)}</tbody></table></div></details>
    <details className="technical-detail"><summary>Detailed reasoning</summary><p className="subtle"><span className="annotation">{label ?? "Record"} {result.id}</span> {result.recommendation}</p><p>{result.explanation}</p></details>
  </section>;
}
