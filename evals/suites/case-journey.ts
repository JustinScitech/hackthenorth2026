import { BROKER_UPDATE_SEPARATOR, buildFacts, evaluateFacts, type Intake } from "../../src/agent/analysis";
import { resolveCaseAppetite } from "../../src/agent/appetite-resolution";
import { draftBrokerEmail, draftContext, inventedFigures, unmentionedFields, type Generate } from "../../src/agent/correspondence";
import { EXTRACTION_FIELDS, parseModelOutput } from "../../src/agent/extraction-schema";
import { assembleExtraction, extractNotes, type ModelAttempt } from "../../src/agent/model";
import type { CaseAppetite } from "../../src/lib/case-appetite";
import type { CaseStatus } from "../../src/lib/types";
import { attemptAsync, same, sleep, type CaseResult, type RunOptions, type Suite } from "../runner";

/**
 * Whole-case journeys through the durable workflow, run in process. Each broker
 * reply starts a new analysis revision: the readers run the full appetite schema
 * over the joined submission and replies, an explicit "Field: value" reply line
 * is the floor over what they took from the prose, and the year and claim count
 * come from the same joined text, exactly as the worker does. Every pause drafts
 * the broker email, which must name each missing item and contain no figure the
 * case does not have. Expected values are the status after each revision and
 * the facts the underwriter finally sees.
 *
 * The model is scripted: each reply carries what a correct reading extracts, so
 * the suite measures the resolution, merge and appetite logic around the model,
 * not the model itself. `EVAL_EXTRACTOR=pipeline` (or gemini-only) with a Gemini
 * key runs the live model instead; those results are informational.
 */
type ReplyModel = Partial<Record<keyof CaseAppetite, unknown>> | "malformed" | "error";
type Reply = string | { text: string; model?: ReplyModel };
type Revision = { status: Extract<CaseStatus, "waiting_for_broker" | "review_ready">; referrals?: number; question?: string[]; conflicts?: number; draft?: "model" | "template" };
type FinalFacts = Partial<{ yearBuilt: number | null; lossValue: number | null; premium: number | null; effective: string | null; expiration: string | null }>;
type Case = { name: string; intake: Omit<Intake, "appetite">; submission: string; replies: Reply[]; expected: Revision[]; finalFacts?: FinalFacts; draftModel?: Record<number, string>; note?: string };

const appetiteLines = "Business type: new\nLine of business: property\nPremium: $85,000\nEligible construction percent: 75%\nEffective date: 2026-01-01\nExpiration date: 2027-01-01";
const intake = (overrides: Partial<Omit<Intake, "appetite">> = {}): Omit<Intake, "appetite"> => ({ insuredName: "Journey property", state: "CO", tiv: 75_000_000, yearBuilt: null, losses: null, ...overrides });
const replyText = (reply: Reply) => typeof reply === "string" ? reply : reply.text;

/** The model attempt a correct reading of the replies so far would produce, in the shape extractNotes reports: later readings supersede earlier ones. */
function scriptedAttempts(replies: Reply[], joined: string): ModelAttempt[] {
  const scripts = replies.map((reply) => typeof reply === "string" ? undefined : reply.model).filter((model): model is ReplyModel => model !== undefined);
  if (!scripts.length) return [];
  const base: ModelAttempt = { source: "Gemini", model: "scripted", status: "failed", durationMs: 0 };
  if (scripts.includes("error")) return [{ ...base, errorCode: 503 }];
  if (scripts.includes("malformed")) return [base];
  const values = Object.assign({}, ...scripts.filter((script) => typeof script === "object")) as Record<string, unknown>;
  const reading = parseModelOutput(Object.fromEntries(EXTRACTION_FIELDS.map((field) => [field, { value: values[field] ?? null, quote: null }])), joined);
  return [{ ...base, status: "completed", reading: reading ?? undefined }];
}

const scriptedDraft = (email: string | undefined): Generate | null => email === undefined ? null : async () => ({ text: JSON.stringify({ email }), modelVersion: "scripted" });

/** Mirrors extractCase + checkCase: readers over the joined text, reply lines as the floor, then the draft when the case pauses. */
async function analyze(item: Case, texts: string[], revision: number, options: RunOptions) {
  const live = options.extractor !== "parser" && options.extractor !== "openai-only" && Boolean(process.env.GEMINI_API_KEY);
  const replies = item.replies.slice(0, revision);
  const notes = texts.join(BROKER_UPDATE_SEPARATOR);
  const extraction = live ? await extractNotes(notes) : assembleExtraction(notes, scriptedAttempts(replies, notes));
  if (live) await sleep(options.modelDelayMs);
  const appetite = resolveCaseAppetite(texts[0], undefined, texts.slice(1).join("\n"), extraction.fields);
  const facts = buildFacts({ ...item.intake, appetite: appetite.value }, extraction.extracted, { ...extraction.fields, appetite: appetite.fields });
  const result = evaluateFacts(facts);
  const draft = result.question ? await draftBrokerEmail({ ...item.intake, appetite: appetite.value, notes }, result.appetiteResult.missingData, result.findings, live ? {} : { generate: scriptedDraft(item.draftModel?.[revision]), models: ["scripted"] }) : null;
  if (live && draft) await sleep(options.modelDelayMs);
  return { facts, result, appetite: appetite.value, notes, draft, conflicts: extraction.conflicts, status: (result.question ? "waiting_for_broker" : "review_ready") as CaseStatus };
}

export const journeyCases: Case[] = [
  {
    name: "submission without loss dollars pauses, reply with dollars and completeness proceeds",
    intake: intake({ yearBuilt: 2015 }),
    submission: `${appetiteLines}\nWarehouse constructed in 2015. No losses in the past three years.`,
    replies: ["Five-year loss value: $12,000\nFive-year history complete: yes"],
    expected: [{ status: "waiting_for_broker", question: ["Five-year loss value"] }, { status: "review_ready", referrals: 0 }],
    finalFacts: { yearBuilt: 2015, lossValue: 12_000 },
    note: "'No losses in the past three years' is a count, not the five-year dollar figure the appetite needs.",
  },
  {
    name: "reply with the year reveals a pre-1990 building that is referred, not approved",
    intake: intake(),
    submission: `${appetiteLines}\nFive-year loss value: 0\nFive-year history complete: yes\nConstruction year to follow.`,
    replies: ["The building was constructed in 1985."],
    expected: [{ status: "waiting_for_broker", question: ["Building age"] }, { status: "review_ready", referrals: 1 }],
    finalFacts: { yearBuilt: 1985, lossValue: 0 },
  },
  {
    name: "two follow-ups collect premium and then loss history",
    intake: intake({ yearBuilt: 2012 }),
    submission: "Business type: new\nLine of business: property\nEligible construction percent: 75%\nEffective date: 2026-01-01\nExpiration date: 2027-01-01\nPremium and loss runs to follow.",
    replies: ["Premium: $90,000", "Five-year loss value: $40,000\nFive-year history complete: yes"],
    expected: [{ status: "waiting_for_broker", question: ["Total premium", "Five-year loss value"] }, { status: "waiting_for_broker", question: ["Five-year loss value"] }, { status: "review_ready", referrals: 0 }],
    finalFacts: { yearBuilt: 2012, lossValue: 40_000 },
  },
  {
    name: "complete submission goes straight to review with no referrals",
    intake: intake({ yearBuilt: 2015 }),
    submission: `${appetiteLines}\nFive-year loss value: 0\nFive-year history complete: yes`,
    replies: [],
    expected: [{ status: "review_ready", referrals: 0 }],
    finalFacts: { yearBuilt: 2015, lossValue: 0 },
  },
  {
    name: "renewal submission goes straight to review as an exception",
    intake: intake({ yearBuilt: 2015 }),
    submission: `${appetiteLines.replace("Business type: new", "Business type: renewal")}\nFive-year loss value: 0\nFive-year history complete: yes`,
    replies: [],
    expected: [{ status: "review_ready", referrals: 1 }],
  },
  {
    name: "a reply with only a claim count keeps waiting for loss dollars",
    intake: intake({ yearBuilt: 2010 }),
    submission: `${appetiteLines}\nLoss history to follow.`,
    replies: ["No losses in the past three years."],
    expected: [{ status: "waiting_for_broker", question: ["Five-year loss value"] }, { status: "waiting_for_broker", question: ["Five-year loss value"] }],
    finalFacts: { yearBuilt: 2010, lossValue: null },
    note: "A claim count must not be read as a dollar figure; the agent keeps asking.",
  },
  {
    name: "large incomplete losses are referred rather than asked about again",
    intake: intake({ yearBuilt: 2015 }),
    submission: `${appetiteLines}\nFive-year loss value: $250,000\nFive-year history complete: no`,
    replies: [],
    expected: [{ status: "review_ready", referrals: 1 }],
    finalFacts: { yearBuilt: 2015, lossValue: 250_000 },
  },
  {
    name: "freeform reply with premium and policy dates reaches review with the right facts",
    intake: intake({ yearBuilt: 2015 }),
    submission: "Business type: new\nLine of business: property\nEligible construction percent: 75%\nFive-year loss value: 0\nFive-year history complete: yes\nPremium and policy dates to follow.",
    replies: [{ text: "Premium's about 48k, policy runs Jan 1 to Dec 31 2026", model: { premium: 48_000, effective: "2026-01-01", expiration: "2026-12-31" } }],
    expected: [{ status: "waiting_for_broker", question: ["Total premium", "effective date", "expiration date"] }, { status: "review_ready", referrals: 1 }],
    finalFacts: { yearBuilt: 2015, premium: 48_000, effective: "2026-01-01", expiration: "2026-12-31" },
    note: "A broker who writes in prose is read like one who fills in the form, and $48K premium is below appetite, so it is referred rather than asked about again.",
  },
  {
    name: "freeform loss run reply supplies the dollars and completeness",
    intake: intake({ yearBuilt: 2015 }),
    submission: `${appetiteLines}\nThere was a water claim in 2019 but no dollar figure is available yet.`,
    replies: [{ text: "Loss runs attached: the 2019 water claim paid out $12,500 and that is everything on the account over the last five years.", model: { lossValue: 12_500, lossHistoryComplete: true } }],
    expected: [{ status: "waiting_for_broker", question: ["Five-year loss value"] }, { status: "review_ready", referrals: 0 }],
    finalFacts: { yearBuilt: 2015, lossValue: 12_500 },
  },
  {
    name: "freeform reply without a model keeps waiting and invents nothing",
    intake: intake({ yearBuilt: 2015 }),
    submission: "Business type: new\nLine of business: property\nEligible construction percent: 75%\nFive-year loss value: 0\nFive-year history complete: yes\nPremium and policy dates to follow.",
    replies: ["Premium's about 48k, policy runs Jan 1 to Dec 31 2026"],
    expected: [{ status: "waiting_for_broker", question: ["Total premium"] }, { status: "waiting_for_broker", question: ["Total premium", "effective date"] }],
    finalFacts: { premium: null, effective: null },
    note: "With no model the strict lines are the only reader; prose is not guessed at.",
  },
  {
    name: "an explicit line beats a disagreeing model reading and the disagreement is visible",
    intake: intake({ yearBuilt: 2015 }),
    submission: `${appetiteLines.replace("Premium: $85,000\n", "")}\nFive-year loss value: 0\nFive-year history complete: yes\nPremium to follow.`,
    replies: [{ text: "Premium: $90,000\nWe first floated 95 but settled at 90.", model: { premium: 95_000 } }],
    expected: [{ status: "waiting_for_broker", question: ["Total premium"] }, { status: "review_ready", referrals: 0, conflicts: 1 }],
    finalFacts: { premium: 90_000 },
  },
  {
    name: "malformed model output leaves the explicit lines intact",
    intake: intake({ yearBuilt: 2015 }),
    submission: `${appetiteLines}\nLoss history to follow.`,
    replies: [{ text: "Five-year loss value: $12,000\nFive-year history complete: yes", model: "malformed" }],
    expected: [{ status: "waiting_for_broker", question: ["Five-year loss value"] }, { status: "review_ready", referrals: 0, conflicts: 0 }],
    finalFacts: { lossValue: 12_000 },
  },
  {
    name: "a model outage during a freeform reply keeps the case waiting instead of failing it",
    intake: intake({ yearBuilt: 2015 }),
    submission: `${appetiteLines}\nLoss history to follow.`,
    replies: [{ text: "Total five-year losses were $12,000 and that is the complete history.", model: "error" }],
    expected: [{ status: "waiting_for_broker", question: ["Five-year loss value"] }, { status: "waiting_for_broker", question: ["Five-year loss value"] }],
    finalFacts: { lossValue: null },
  },
  {
    name: "a model draft that cites the broker's note is used as the email",
    intake: intake({ yearBuilt: 2015 }),
    submission: `${appetiteLines}\nThere was a water claim in 2019 but no dollar figure is available yet.`,
    replies: [],
    expected: [{ status: "waiting_for_broker", question: ["Five-year loss value"], draft: "model" }],
    draftModel: { 0: "Hello, regarding Journey property: your note mentions a 2019 water claim but no dollar figure. Could you send the five-year loss run and confirm it covers the whole account? A plain reply is fine." },
  },
  {
    name: "a model draft that invents a dollar figure is replaced by the template",
    intake: intake({ yearBuilt: 2015 }),
    submission: `${appetiteLines}\nThere was a water claim in 2019 but no dollar figure is available yet.`,
    replies: [],
    expected: [{ status: "waiting_for_broker", question: ["Five-year loss value"], draft: "template" }],
    draftModel: { 0: "Hello, regarding Journey property: your note mentions a 2019 water claim, which we assume paid around $60,000. Please send the five-year loss run." },
    note: "An email to the broker must never put a number in their mouth.",
  },
  {
    name: "a model draft that skips one of two missing items is replaced by the template",
    intake: intake({ yearBuilt: 2012 }),
    submission: "Business type: new\nLine of business: property\nEligible construction percent: 75%\nEffective date: 2026-01-01\nExpiration date: 2027-01-01\nPremium and loss runs to follow.",
    replies: [],
    expected: [{ status: "waiting_for_broker", question: ["Total premium", "Five-year loss value"], draft: "template" }],
    draftModel: { 0: "Hello, regarding Journey property: could you send the five-year loss run so we can complete the review? A plain reply is fine." },
  },
];

export const journeySuite: Suite = {
  name: "case-journey",
  description: "Multi-revision case flow on the carrier appetite: pause for the broker with a safe email draft, resume on typed or freeform replies, reach review with the right facts",
  async run(options) {
    const results: CaseResult[] = [];
    for (const item of journeyCases) {
      results.push(await attemptAsync(item.name, async () => {
        const problems: string[] = [];
        if (item.expected.length !== item.replies.length + 1) problems.push("case definition must have one expectation per revision");
        const texts = [item.submission];
        let last!: Awaited<ReturnType<typeof analyze>>;
        for (const [revision, expected] of item.expected.entries()) {
          if (revision > 0) texts.push(replyText(item.replies[revision - 1]));
          last = await analyze(item, texts, revision, options);
          if (last.status !== expected.status) problems.push(`revision ${revision}: status ${last.status} expected ${expected.status}`);
          const referrals = last.result.findings.filter((finding) => finding.result === "refer").length;
          if (expected.referrals !== undefined && referrals !== expected.referrals) problems.push(`revision ${revision}: ${referrals} referrals expected ${expected.referrals}`);
          if (expected.conflicts !== undefined && last.conflicts.length !== expected.conflicts) problems.push(`revision ${revision}: ${last.conflicts.length} reply conflicts expected ${expected.conflicts}`);
          for (const part of expected.question ?? []) if (!last.result.question?.includes(part)) problems.push(`revision ${revision}: question "${last.result.question}" lacks "${part}"`);
          if (last.draft) {
            const missing = last.result.appetiteResult.missingData;
            const unmentioned = unmentionedFields(last.draft.text, missing);
            if (unmentioned.length) problems.push(`revision ${revision}: draft never asks for ${unmentioned.join(", ")}`);
            const invented = inventedFigures(last.draft.text, draftContext({ ...item.intake, appetite: last.appetite, notes: last.notes }, missing, last.result.findings));
            if (invented.length) problems.push(`revision ${revision}: draft invents ${invented.join(", ")}`);
            if (expected.draft && last.draft.source !== expected.draft) problems.push(`revision ${revision}: draft came from the ${last.draft.source}${last.draft.fallbackReason ? ` (${last.draft.fallbackReason})` : ""}, expected the ${expected.draft}`);
          } else if (expected.draft) problems.push(`revision ${revision}: no draft was produced`);
        }
        const appetite = last.facts.appetite?.value;
        const unknown = (concept: string) => last.result.appetiteResult.criteria.find((criterion) => criterion.concept === concept)?.status === "unknown";
        const finalFacts: FinalFacts = {
          yearBuilt: last.facts.yearBuilt.value,
          lossValue: unknown("lossValue") ? null : appetite?.lossValue ?? null,
          premium: unknown("premium") ? null : appetite?.premium ?? null,
          effective: appetite?.effective ?? null,
          expiration: appetite?.expiration ?? null,
        };
        for (const [key, value] of Object.entries(item.finalFacts ?? {})) {
          if (!same(finalFacts[key as keyof FinalFacts], value)) problems.push(`final ${key} ${JSON.stringify(finalFacts[key as keyof FinalFacts])} expected ${JSON.stringify(value)}`);
        }
        return problems;
      }, item.note));
    }
    return results;
  },
};
