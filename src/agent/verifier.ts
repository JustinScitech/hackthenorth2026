import { z } from "zod";
import { describeCounterfactuals } from "../federato/counterfactual";
import { scoreSubmission, type RankedSubmission } from "../federato/scoring";
import { caseMapping } from "../lib/case-appetite";
import { addAudit as addAuditToDb, db } from "../lib/db";
import { getMongoText } from "../lib/mongo";
import type { CaseRecord, Finding } from "../lib/types";
import { BROKER_UPDATE_SEPARATOR } from "./analysis";
import { runGeminiWaterfall, type ModelAttempt } from "./model";
import { captureAgentError, logAgentEvent } from "./monitoring";
import { geminiJson, geminiModels, type JsonResponse } from "./providers";

/**
 * Second-opinion check on the findings and brief before an underwriter sees
 * them. One Gemini JSON call reads every claim against the source text and
 * says which ones it cannot trace back. The model may only ever make the
 * review more cautious: an unsupported finding becomes a referral with a
 * "Verifier" prefix, a supported one is left exactly as it was, and a
 * deterministic guard keeps the model honest by requiring the text it
 * disputes to really be missing from the sources. No key, a timeout, a model
 * failure, or malformed JSON skips the step with an audit note; it never
 * fails the case job.
 */
export type VerifierSources = {
  /** The submission and processed broker replies, joined the way extraction reads them. */
  brokerNotes?: string | null;
  /** Intake form values, already formatted the way an underwriter would read them. */
  intake?: Record<string, string | number | boolean | null | undefined> | null;
  /** Excerpt of the public page fetched for the case. */
  publicEvidence?: string | null;
  /** One summary line per public property dataset that answered. */
  propertyRecords?: string[] | null;
  /** The carrier rule text the appetite findings are built from, so thresholds such as "$150M" count as sourced. */
  guide?: string | null;
  /** The reviewer's own computed numbers (score, raw score, point adjustments), which the brief repeats and the verifier must not re-derive. */
  scoring?: string | null;
};

export type VerifierVerdict = { id: string; supported: boolean; reason: string; quote: string };

export type VerifierResult = {
  status: "completed" | "skipped" | "failed";
  findings: Finding[];
  brief: string;
  verdicts: VerifierVerdict[];
  /** Claim ids downgraded (findings) or annotated (brief). */
  flagged: string[];
  /** Claims the model called unsupported but the guard could not confirm; left untouched. */
  overruled: string[];
  /** Claims the model returned no verdict for; left untouched. */
  unverified: string[];
  model?: string;
  reason?: string;
  attempts: ModelAttempt<VerifierVerdict[]>[];
};

export type VerifierOptions = {
  brief?: string;
  /** Replaces the Gemini call, for tests and evals. */
  generate?: (model: string, prompt: string, text: string) => Promise<JsonResponse>;
  models?: readonly string[];
  /** Deadline for the whole waterfall, so a hung call cannot stall the case job. */
  timeoutMs?: number;
};

export const BRIEF_CLAIM_ID = "brief";
export const DEFAULT_VERIFIER_TIMEOUT_MS = 45_000;
const MAX_SOURCE_CHARS = 12_000;
const MAX_REASON_CHARS = 200;

export const VERIFIER_PROMPT = [
  "You verify an automated underwriting review. You receive CLAIMS (findings and a brief written by the reviewer) and SOURCES (broker notes, intake form values, a public source excerpt, public property records). For each claim, decide whether every fact it states about this submission is supported by the sources.",
  "A claim is supported only when every observed value it states (years, counts, dollar amounts, states, names, percentages, quoted text) appears in the sources or follows directly from them.",
  "Procedure for each claim: (1) list every separate fact it asserts about this submission, including secondary details such as a renovation, a second date, a size, or a loss; (2) look each fact up in the sources; (3) if any one fact is missing, the claim is unsupported even when its main value is sourced.",
  "Carrier appetite rules and thresholds inside a claim (for example \"Up to $150M\", \"Newer than 1990\", \"target $75K-$100K\", \"1% annual chance\") describe the rules, not the submission; never mark them unsupported.",
  "Scores such as \"Score 49/100\" or \"raw 79-point\", recommendations, and the words refer, pass, unknown, missing, and clarify are the reviewer's judgement, not facts to verify. A claim that says a value is missing or not supplied is supported when the sources do not state it.",
  "Use only the sources. Do not decide whether the submission is a good risk.",
  'Return only JSON: {"verdicts":[{"id":string,"supported":boolean,"reason":string,"quote":string}]} with exactly one verdict per claim id. For an unsupported claim, "quote" is the exact text copied from that claim that the sources do not support (usually a value such as a year, count, or dollar amount). For a supported claim, "quote" is the exact text copied from the sources that supports it. Keep each reason under 30 words.',
].join(" ");

const verdictSchema = z.object({ id: z.string(), supported: z.boolean(), reason: z.string().default(""), quote: z.string().default("") });
const responseSchema = z.union([z.object({ verdicts: z.array(verdictSchema) }).transform((value) => value.verdicts), z.array(verdictSchema)]);

export function parseVerdicts(text: string): VerifierVerdict[] {
  return responseSchema.parse(JSON.parse(text));
}

/** Lower-cased, currency punctuation dropped, everything else collapsed to single spaces, so "$75,000,000." matches "75000000". */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[$,]/g, "").replace(/[^a-z0-9%]+/g, " ").trim();
}

function formatIntakeValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "not provided";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

/** Every appetite finding embeds its rule text; scoring an empty row yields exactly that text with no submission values. */
export function appetiteGuideText(): string {
  return scoreSubmission({ id: "guide" }, caseMapping).criteria.map((criterion) => `${criterion.factor}: ${criterion.detail}`).join("\n");
}

const sign = (points: number) => `${points > 0 ? "+" : ""}${points}`;

/** What the scorer computed, in the notation the brief uses, so "Score 49/100", "flood zone -10", and "built in 1991 or later" read as the reviewer's own arithmetic. */
export function scoringText(result: Pick<RankedSubmission, "score" | "rawScore" | "recommendation"> & Partial<Pick<RankedSubmission, "baseScore" | "adjustments" | "counterfactuals">>): string {
  const lines = [`Score ${result.score}/100 (raw ${result.rawScore}-point match score, capped at ${result.score}). Recommendation: ${result.recommendation.toLowerCase()}.`];
  if (result.adjustments?.length) lines.push(`Public property records: ${result.adjustments.map((item) => `${item.label} ${sign(item.points)}`).join("; ")}; priority ${result.baseScore ?? result.score} → ${result.score}.`);
  const counterfactuals = describeCounterfactuals(result.counterfactuals);
  if (counterfactuals) lines.push(counterfactuals);
  return lines.join("\n");
}

export function renderSources(sources: VerifierSources): string {
  const parts: string[] = [];
  const notes = sources.brokerNotes?.trim();
  if (notes) parts.push(`[Broker notes]\n${notes.slice(0, MAX_SOURCE_CHARS)}`);
  const intake = Object.entries(sources.intake ?? {}).filter(([, value]) => value !== undefined);
  if (intake.length) parts.push(`[Intake form]\n${intake.map(([key, value]) => `${key}: ${formatIntakeValue(value)}`).join("\n")}`);
  const evidence = sources.publicEvidence?.trim();
  if (evidence) parts.push(`[Public source excerpt]\n${evidence.slice(0, MAX_SOURCE_CHARS)}`);
  const records = (sources.propertyRecords ?? []).map((line) => line.trim()).filter(Boolean);
  if (records.length) parts.push(`[Public property records]\n${records.join("\n")}`);
  const guide = sources.guide?.trim();
  if (guide) parts.push(`[Carrier appetite guide]\n${guide}`);
  const scoring = sources.scoring?.trim();
  if (scoring) parts.push(`[Reviewer scoring]\n${scoring}`);
  return parts.join("\n\n");
}

export function renderClaims(findings: Finding[], brief?: string): string {
  const lines = findings.map((finding) => `[id=${finding.id}] ${finding.label} (${finding.result}): ${finding.detail}`);
  if (brief?.trim()) lines.push(`[id=${BRIEF_CLAIM_ID}] Brief: ${brief.trim()}`);
  return lines.join("\n");
}

/**
 * The deterministic guard. An unsupported verdict may only change a claim when
 * the model quotes text that is really in the claim and really absent from
 * every source; anything else is the model's word alone and is overruled.
 */
export function flaggable(verdict: VerifierVerdict, claim: string, corpus: string): boolean {
  if (verdict.supported) return false;
  const quote = normalizeForMatch(verdict.quote);
  if (quote.length < 2) return false;
  if (!normalizeForMatch(claim).includes(quote)) return false;
  return !normalizeForMatch(corpus).includes(quote);
}

/** The model's reason as a parenthetical, so a verifier note stays one sentence. */
function because(reason: string): string {
  const trimmed = reason.replace(/\s+/g, " ").trim().slice(0, MAX_REASON_CHARS).replace(/[.!?]+$/, "");
  return trimmed ? ` (${trimmed})` : "";
}

export type AppliedVerdicts = { findings: Finding[]; brief: string; flagged: string[]; overruled: string[]; unverified: string[] };

/** Applies verdicts: never touches a supported claim, never raises a result, only ever adds a "Verifier" note and a referral. */
export function applyVerdicts(findings: Finding[], brief: string, verdicts: VerifierVerdict[], corpus: string): AppliedVerdicts {
  const byId = new Map<string, VerifierVerdict>();
  for (const verdict of verdicts) if (!byId.has(verdict.id)) byId.set(verdict.id, verdict);
  const flagged: string[] = [];
  const overruled: string[] = [];
  const unverified: string[] = [];
  const decide = (id: string, claim: string): VerifierVerdict | null => {
    const verdict = byId.get(id);
    if (!verdict) { unverified.push(id); return null; }
    if (flaggable(verdict, claim, corpus)) { flagged.push(id); return verdict; }
    if (!verdict.supported) overruled.push(id);
    return null;
  };
  const next = findings.map((finding) => {
    const verdict = decide(finding.id, finding.detail);
    if (!verdict) return finding;
    return { ...finding, result: "refer" as const, detail: `Verifier: "${verdict.quote.trim()}" was not found in the sources${because(verdict.reason)}; confirm before relying on this finding. ${finding.detail}` };
  });
  let nextBrief = brief;
  if (brief.trim()) {
    // Like the public-source sentence checkCase adds, the brief must say when its own findings were referred by the verifier.
    const referred = next.filter((finding, index) => finding !== findings[index]);
    if (referred.length) nextBrief += ` Verifier: ${referred.length} finding${referred.length === 1 ? "" : "s"} could not be traced to the sources (${referred.map((finding) => finding.label.toLowerCase()).join(", ")}); confirm before deciding.`;
    const verdict = decide(BRIEF_CLAIM_ID, brief);
    if (verdict) nextBrief += ` Verifier: "${verdict.quote.trim()}" could not be traced to the sources${because(verdict.reason)}; confirm before deciding.`;
  }
  return { findings: next, brief: nextBrief, flagged, overruled, unverified };
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Verifier timed out after ${ms}ms`)), ms); });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function describeFailure(attempts: ModelAttempt<VerifierVerdict[]>[]): string {
  const last = attempts.at(-1);
  return `Gemini verification unavailable (${attempts.length} attempt${attempts.length === 1 ? "" : "s"}${last?.errorCode ? `, HTTP ${last.errorCode}` : ""})`;
}

export async function verifyFindings(findings: Finding[], sources: VerifierSources, options: VerifierOptions = {}): Promise<VerifierResult> {
  const brief = options.brief ?? "";
  const untouched = (status: VerifierResult["status"], reason: string, attempts: ModelAttempt<VerifierVerdict[]>[] = []): VerifierResult =>
    ({ status, findings, brief, verdicts: [], flagged: [], overruled: [], unverified: [], reason, attempts });
  const corpus = renderSources(sources);
  const claims = renderClaims(findings, brief);
  if (!claims) return untouched("skipped", "No findings to verify");
  if (!corpus) return untouched("skipped", "No source text to verify against");
  const generate = options.generate ?? ((model: string, prompt: string, text: string) => geminiJson(model, prompt, text, { retries: 2, timeoutMs: options.timeoutMs ?? DEFAULT_VERIFIER_TIMEOUT_MS }));
  const request = `CLAIMS\n${claims}\n\nSOURCES\n${corpus}`;
  let attempts: ModelAttempt<VerifierVerdict[]>[] = [];
  try {
    attempts = await withDeadline(runGeminiWaterfall<VerifierVerdict[]>((model) => generate(model, VERIFIER_PROMPT, request), undefined, options.models ?? geminiModels(), request, parseVerdicts), options.timeoutMs ?? DEFAULT_VERIFIER_TIMEOUT_MS);
  } catch (error) {
    return untouched("failed", error instanceof Error ? error.message : "Verifier failed", attempts);
  }
  const completed = attempts.find((attempt) => attempt.status === "completed" && attempt.value);
  if (!completed?.value) return untouched("failed", describeFailure(attempts), attempts);
  const applied = applyVerdicts(findings, brief, completed.value, corpus);
  return { status: "completed", ...applied, verdicts: completed.value, model: completed.model, attempts };
}

// --- Case orchestration: reads the stored sources, runs the check, writes the audit trail. ---

export type VerifyCaseDeps = {
  env: Record<string, string | undefined>;
  /** Submission text followed by each processed broker reply. */
  loadBrokerTexts: (caseRecord: CaseRecord) => Promise<string[]>;
  addAudit: (caseId: string, eventType: string, detail?: Record<string, unknown>, eventKey?: string) => Promise<unknown>;
  generate?: VerifierOptions["generate"];
  timeoutMs?: number;
};

async function loadBrokerTextsFromStores(caseRecord: CaseRecord): Promise<string[]> {
  const replies = await db.query("SELECT source_key FROM case_actions WHERE case_id = $1 AND kind = 'broker_response' AND processed_at IS NOT NULL ORDER BY created_at", [caseRecord.id]);
  const texts = await Promise.all([caseRecord.sourceKey, ...replies.rows.map((row) => String(row.source_key))].map(getMongoText));
  return texts.filter((text): text is string => typeof text === "string");
}

const money = (value: number | null | undefined) => typeof value === "number" ? `$${value.toLocaleString("en-US")}` : null;

/** The intake form as the underwriter sees it, so values like $75,000,000 read the same way in claims and sources. */
export function intakeSources(caseRecord: CaseRecord): NonNullable<VerifierSources["intake"]> {
  const appetite = caseRecord.appetite;
  return {
    "insured name": caseRecord.insuredName,
    state: caseRecord.state,
    "total insured value": money(caseRecord.tiv),
    "year built": caseRecord.yearBuilt,
    "three-year loss count": caseRecord.losses,
    address: caseRecord.address,
    "public source url": caseRecord.publicSourceUrl,
    "business type": appetite?.business ?? null,
    "line of business": appetite?.line ?? null,
    premium: money(appetite?.premium),
    "eligible construction percent": typeof appetite?.constructionPercent === "number" ? `${appetite.constructionPercent}%` : null,
    "five-year loss value": money(appetite?.lossValue),
    "five-year history complete": appetite?.lossHistoryComplete ?? null,
    "effective date": appetite?.effective ?? null,
    "expiration date": appetite?.expiration ?? null,
  };
}

export function caseSources(caseRecord: CaseRecord, brokerTexts: string[], appetiteResult?: RankedSubmission | null): VerifierSources {
  return {
    brokerNotes: brokerTexts.join(BROKER_UPDATE_SEPARATOR),
    intake: intakeSources(caseRecord),
    publicEvidence: caseRecord.publicEvidence?.excerpt ?? null,
    propertyRecords: (caseRecord.propertyContext?.sources ?? []).filter((source) => source.status === "ok").map((source) => `${source.label}: ${source.summary}`),
    guide: appetiteGuideText(),
    scoring: appetiteResult ? scoringText(appetiteResult) : null,
  };
}

const defaultDeps = (): VerifyCaseDeps => ({ env: process.env, loadBrokerTexts: loadBrokerTextsFromStores, addAudit: addAuditToDb });

/**
 * Runs the verifier for one analysis revision and applies its result to
 * `result` in place. Every failure path ends in a `verifier_skipped` audit
 * note; nothing here throws into checkCase.
 */
export async function verifyCase(caseId: string, caseRecord: CaseRecord, result: { findings: Finding[]; brief: string; appetiteResult?: RankedSubmission | null }, deps: VerifyCaseDeps = defaultDeps()): Promise<VerifierResult | null> {
  const revision = caseRecord.analysisRevision;
  const audit = async (eventType: string, detail: Record<string, unknown>, key: string) => { try { await deps.addAudit(caseId, eventType, { revision, ...detail }, key); } catch (error) { captureAgentError(error); } };
  const skip = async (reason: string) => { await audit("verifier_skipped", { reason }, `verifier-skipped:${caseId}:${revision}`); return null; };
  if (!deps.env.GEMINI_API_KEY) return skip("Gemini is not configured; findings were not independently verified");
  try {
    const sources = caseSources(caseRecord, await deps.loadBrokerTexts(caseRecord), result.appetiteResult);
    await audit("verifier_started", { claims: result.findings.length + (result.brief.trim() ? 1 : 0) }, `verifier-started:${caseId}:${revision}`);
    const started = performance.now();
    const verified = await verifyFindings(result.findings, sources, { brief: result.brief, generate: deps.generate, timeoutMs: deps.timeoutMs });
    if (verified.status !== "completed") return skip(verified.reason ?? "Verifier unavailable");
    for (const id of verified.flagged) {
      const verdict = verified.verdicts.find((item) => item.id === id);
      const before = result.findings.find((finding) => finding.id === id);
      await audit("verifier_flagged", { id, label: before?.label ?? "Brief", quote: verdict?.quote.trim().slice(0, 200) ?? "", reason: verdict?.reason.trim().slice(0, MAX_REASON_CHARS) ?? "", previousResult: before?.result ?? "brief" }, `verifier-flagged:${caseId}:${revision}:${id}`);
    }
    result.findings = verified.findings;
    result.brief = verified.brief;
    const supported = verified.verdicts.filter((verdict) => verdict.supported).length;
    await audit("verifier_completed", { model: verified.model, checked: verified.verdicts.length, supported, flagged: verified.flagged.length, overruled: verified.overruled.length, unverified: verified.unverified.length, durationMs: Math.round(performance.now() - started) }, `verifier:${caseId}:${revision}`);
    logAgentEvent("verifier_completed", { caseId, revision, flagged: verified.flagged.length, overruled: verified.overruled.length, model: verified.model });
    return verified;
  } catch (error) {
    captureAgentError(error);
    return skip(`Verifier could not read the case sources (${error instanceof Error ? error.name : "UnknownError"})`);
  }
}
