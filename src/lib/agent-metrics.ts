import "server-only";
import { db } from "./db";

export type AgentMetrics = {
  periodDays: number;
  submissions: number;
  awaitingBroker: number;
  readyForReview: number;
  approved: number;
  declined: number;
  failed: number;
  modelExtractions: number;
  parserExtractions: number;
  averageAnalysisSeconds: number | null;
  sentryExportEnabled: boolean;
  latestEval: { passed: number; total: number; durationMs: number; model: string | null; createdAt: string } | null;
};

export async function getAgentMetrics(): Promise<AgentMetrics> {
  const periodDays = 30;
  const [cases, extractions, evals] = await Promise.all([
    db.query(`WITH recent AS (
      SELECT id, status, created_at FROM cases WHERE created_at >= now() - interval '30 days'
    ), first_checks AS (
      SELECT case_id, min(created_at) AS completed_at FROM audit_events
      WHERE event_type = 'analysis_completed' GROUP BY case_id
    )
    SELECT count(*)::int AS submissions,
      count(*) FILTER (WHERE status = 'waiting_for_broker')::int AS awaiting_broker,
      count(*) FILTER (WHERE status = 'review_ready')::int AS ready_for_review,
      count(*) FILTER (WHERE status = 'approved')::int AS approved,
      count(*) FILTER (WHERE status = 'declined')::int AS declined,
      count(*) FILTER (WHERE status = 'failed')::int AS failed,
      avg(extract(epoch FROM (first_checks.completed_at - recent.created_at)))
        FILTER (WHERE first_checks.completed_at IS NOT NULL) AS average_analysis_seconds
    FROM recent LEFT JOIN first_checks ON first_checks.case_id = recent.id`),
    db.query(`SELECT
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(detail->'attempts', '[]'::jsonb)) attempt
        WHERE attempt->>'status' = 'completed'
      ))::int AS model_extractions,
      count(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(detail->'attempts', '[]'::jsonb)) attempt
        WHERE attempt->>'status' = 'completed'
      ))::int AS parser_extractions
    FROM audit_events WHERE event_type = 'extraction_completed'
      AND created_at >= now() - interval '30 days'`),
    db.query("SELECT passed, total, duration_ms, model, created_at FROM agent_eval_runs WHERE created_at >= now() - interval '30 days' ORDER BY created_at DESC LIMIT 1"),
  ]);
  const row = cases.rows[0];
  const extraction = extractions.rows[0];
  const evalRun = evals.rows[0];
  return {
    periodDays,
    submissions: Number(row.submissions),
    awaitingBroker: Number(row.awaiting_broker),
    readyForReview: Number(row.ready_for_review),
    approved: Number(row.approved),
    declined: Number(row.declined),
    failed: Number(row.failed),
    modelExtractions: Number(extraction.model_extractions),
    parserExtractions: Number(extraction.parser_extractions),
    averageAnalysisSeconds: row.average_analysis_seconds === null ? null : Math.round(Number(row.average_analysis_seconds)),
    sentryExportEnabled: Boolean(process.env.SENTRY_DSN),
    latestEval: evalRun ? {
      passed: Number(evalRun.passed), total: Number(evalRun.total), durationMs: Number(evalRun.duration_ms),
      model: evalRun.model, createdAt: new Date(evalRun.created_at).toISOString(),
    } : null,
  };
}
