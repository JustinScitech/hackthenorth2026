import type { AuditEvent, CaseRecord, Fact } from "@/lib/types";
import type { RankedSubmission } from "@/federato/scoring";
import { shouldFallThroughGeminiError } from "./model";
import { errorCode, geminiModels, geminiText, geminiTextStream, type ChatContent } from "./providers";

export type ChatTurn = { role: "you" | "agent"; text: string };

/** Earlier turns that ride along with each question: enough for a natural back-and-forth without dragging a whole session into every call. */
const HISTORY_LIMIT = 12;

export const CHAT_PROMPT = [
  "You are Astra, the underwriting agent reviewing the commercial property record below with an underwriter. They may be speaking to you out loud, and your reply may be read aloud.",
  "Answer from the supplied review record. Give a fact's source and confidence when it matters. When the record lacks something, say so and suggest where it would come from.",
  "Keep replies short and conversational: two to four plain sentences, spoken-word style, with no headings, lists, or markdown. Say things directly and skip framing by contrast, such as 'not X, but Y'.",
  "You explain and recommend; the underwriter decides. Quoting and binding happen elsewhere. Do not claim that a broker was contacted or an exception was approved. For local cases, broker replies and decisions use the forms on the case page. For Federato records, explain that this review is advisory and does not write back to Federato.",
].join(" ");

const money = (value: number) => `$${value.toLocaleString("en-US")}`;

function factLine<T>(label: string, item: Fact<T> | undefined, format: (value: T) => string = String): string | null {
  if (!item) return null;
  return `${label}: ${item.value === null ? "unknown" : format(item.value)} (${item.source}, ${Math.round(item.confidence * 100)}% confidence)`;
}

/** Everything the agent knows about the case, as plain lines the model can read. `precedent` is the similar-case lines from similar-cases.ts, when there are any. */
export function caseBriefing(caseRecord: CaseRecord, audit: AuditEvent[], precedent: string[] = []): string {
  const submitted = [caseRecord.state ?? "primary state pending", caseRecord.tiv === null ? "total insured value pending" : `${money(caseRecord.tiv)} total insured value`];
  if (caseRecord.yearBuilt !== null) submitted.push(`built ${caseRecord.yearBuilt}`);
  if (caseRecord.losses !== null) submitted.push(`${caseRecord.losses} losses reported on the form`);
  const lines: (string | null)[] = [
    `Insured: ${caseRecord.insuredName}`,
    `Status: ${caseRecord.status.replaceAll("_", " ")}`,
    `Submitted: ${submitted.join(", ")}`,
  ];
  if (caseRecord.facts) {
    lines.push("Extracted facts:");
    lines.push(factLine("State", caseRecord.facts.state));
    lines.push(factLine("Total insured value", caseRecord.facts.tiv, money));
    lines.push(factLine("Year built", caseRecord.facts.yearBuilt));
    lines.push(factLine("Loss count, past three years", caseRecord.facts.losses));
  }
  if (caseRecord.extractionConflicts.length) lines.push(`Conflicts between sources: ${caseRecord.extractionConflicts.join("; ")}`);
  if (caseRecord.appetite) lines.push(`Appetite evidence on the form: ${JSON.stringify(caseRecord.appetite)}`);
  if (caseRecord.findings?.length) {
    lines.push("Carrier appetite checks:");
    for (const finding of caseRecord.findings) lines.push(`- ${finding.label}: ${finding.result}. ${finding.detail} (source: ${finding.source})`);
  }
  if (caseRecord.appetiteResult) {
    const result = caseRecord.appetiteResult;
    lines.push(`Appetite result: match score ${result.rawScore}/100, priority score ${result.score}/100. ${result.recommendation} ${result.explanation}`);
  }
  if (caseRecord.publicEvidence) lines.push(`Public source (${caseRecord.publicEvidence.url}): ${caseRecord.publicEvidence.excerpt}`);
  if (caseRecord.propertyContext?.geocoded) {
    lines.push(`Property address: ${caseRecord.propertyContext.geocoded.matchedAddress}`);
    lines.push("Public property records:");
    for (const source of caseRecord.propertyContext.sources) lines.push(`- ${source.label}: ${source.summary}`);
  }
  if (caseRecord.appetiteResult?.counterfactuals?.length) lines.push("What would change the outcome (appetite only; one factor at a time):", ...caseRecord.appetiteResult.counterfactuals.map((item) => `- ${item.sentence}`));
  if (caseRecord.appetiteResult?.adjustments?.length) lines.push(`Priority adjustments from public records (appetite-only score ${caseRecord.appetiteResult.baseScore}): ${caseRecord.appetiteResult.adjustments.map((item) => `${item.label} ${item.points > 0 ? "+" : ""}${item.points}`).join("; ")}`);
  if (caseRecord.brief) lines.push(`Review brief: ${caseRecord.brief}`);
  if (caseRecord.question) lines.push(`Open question for the broker: ${caseRecord.question}`);
  if (caseRecord.decision) lines.push(`Underwriter decision (${caseRecord.status}): ${caseRecord.decision}`);
  lines.push(...precedent);
  if (caseRecord.error) lines.push(`Analysis error: ${caseRecord.error}`);
  if (audit.length) lines.push(`Recent activity: ${audit.slice(-8).map((event) => `${event.eventType.replaceAll("_", " ")} at ${new Date(event.createdAt).toISOString()}`).join("; ")}`);
  return lines.filter((line): line is string => line !== null).join("\n");
}

export function triageBriefing(resource: string, item: RankedSubmission): string {
  return [
    `Federato ${resource} record ${item.id}: ${item.account}`,
    `Lifecycle status: ${item.lifecycleStatus ?? "unknown"}`,
    `Appetite result: match ${item.rawScore}/100, priority ${item.score}/100. ${item.recommendation}. ${item.explanation}`,
    `Evidence scope: ${item.evidenceNote ?? "No additional evidence note"}`,
    ...item.criteria.map((criterion) => `${criterion.factor}: ${criterion.status}, ${criterion.points}/${criterion.maximum}. ${criterion.detail} Source: ${criterion.source}`),
    `Missing or ambiguous data: ${item.missingData.join(", ") || "none reported"}`,
  ].join("\n");
}

function chatContents(history: ChatTurn[], question: string): ChatContent[] {
  const turns = history.slice(-HISTORY_LIMIT);
  while (turns[0]?.role === "agent") turns.shift();
  return [...turns.map((turn): ChatContent => ({ role: turn.role === "you" ? "user" : "model", text: turn.text })), { role: "user", text: question }];
}

export async function answerReviewQuestion(briefing: string, history: ChatTurn[], question: string): Promise<{ reply: string; model: string }> {
  if (!process.env.GEMINI_API_KEY) throw Object.assign(new Error("No chat model is configured"), { status: 503 });
  const system = `${CHAT_PROMPT}\n\nReview record:\n${briefing}`;
  const contents = chatContents(history, question);
  let lastError: unknown;
  for (const model of geminiModels()) {
    try {
      const response = await geminiText(model, system, contents, { retries: 1, timeoutMs: 30_000 });
      const reply = response.text?.trim();
      if (reply) return { reply, model: response.modelVersion ?? model };
      lastError = new Error(`Empty reply from ${model}`);
    } catch (error) {
      lastError = error;
      if (!shouldFallThroughGeminiError(error) && errorCode(error) !== 429) break;
    }
  }
  throw lastError ?? new Error("No model answered");
}

export async function streamReviewQuestion(briefing: string, history: ChatTurn[], question: string, onChunk: (chunk: string) => void): Promise<{ reply: string; model: string }> {
  if (!process.env.GEMINI_API_KEY) throw Object.assign(new Error("No chat model is configured"), { status: 503 });
  const system = `${CHAT_PROMPT}\n\nReview record:\n${briefing}`;
  const contents = chatContents(history, question);
  let lastError: unknown;
  for (const model of geminiModels()) {
    let emitted = false;
    try {
      const response = await geminiTextStream(model, system, contents, (chunk) => { emitted = true; onChunk(chunk); }, { timeoutMs: 30_000 });
      const reply = response.text?.trim();
      if (reply) return { reply, model: response.modelVersion ?? model };
      lastError = new Error(`Empty reply from ${model}`);
    } catch (error) {
      lastError = error;
      if (emitted || !shouldFallThroughGeminiError(error) && errorCode(error) !== 429) break;
    }
  }
  throw lastError ?? new Error("No model answered");
}

/**
 * Answers one question about a case, carrying the recent conversation so follow-ups make sense.
 * Walks the Gemini waterfall like extraction does, with one difference: a model that is out of
 * quota (429) is skipped for the next one, because a conversation should keep going during a demo
 * even when one model's free-tier allowance for the day is spent.
 */
export async function answerCaseQuestion(caseRecord: CaseRecord, audit: AuditEvent[], history: ChatTurn[], question: string, precedent: string[] = []): Promise<{ reply: string; model: string }> {
  return answerReviewQuestion(caseBriefing(caseRecord, audit, precedent), history, question);
}
