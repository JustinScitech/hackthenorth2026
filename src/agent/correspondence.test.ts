import assert from "node:assert/strict";
import test from "node:test";
import { brokerAppetiteInstructions } from "../lib/case-appetite";
import type { Finding } from "../lib/types";
import { draftBrokerEmail, draftContext, inventedFigures, templateBrokerEmail, unmentionedFields, type DraftCase, type Generate } from "./correspondence";

const journey: DraftCase = { insuredName: "Journey property", state: "CO", tiv: 75_000_000, yearBuilt: 2015, losses: null, appetite: { premium: 85_000 }, notes: "Warehouse constructed in 2015. There was a water claim in 2019 but no dollar figure is available yet." };
const findings: Finding[] = [
  { id: "premium", label: "Total premium", result: "pass", detail: "$50K-$175K; target $75K-$100K. Observed $85,000.", source: "Intake" },
  { id: "lossValue", label: "Five-year loss value", result: "unknown", detail: "Five-year loss dollars under $100K required. Observed missing.", source: "Not provided" },
];
const missing = ["Five-year loss value", "effective date", "expiration date"];

function withoutKeys<T>(run: () => Promise<T>): Promise<T> {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  return run().finally(() => { if (saved === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved; });
}

const scripted = (email: string): Generate => async () => ({ text: JSON.stringify({ email }), modelVersion: "scripted-model" });
const goodEmail = "Hello, regarding Journey property: your note mentions a 2019 water claim but no dollar figure — could you send the five-year loss run? Please also confirm the policy effective and expiration dates. A plain reply is fine.";

test("template email is the existing broker question and names every missing field", () => {
  const text = templateBrokerEmail(missing);
  assert.equal(text, `Please provide or clarify: ${missing.join(", ")}. ${brokerAppetiteInstructions}`);
  assert.deepEqual(unmentionedFields(text, missing), []);
});

test("no key: the draft is the template with no invented figures", async () => {
  const draft = await withoutKeys(() => draftBrokerEmail(journey, missing, findings));
  assert.equal(draft.source, "template");
  assert.equal(draft.text, templateBrokerEmail(missing));
  assert.deepEqual(inventedFigures(draft.text, draftContext(journey, missing, findings)), []);
});

test("mocked model: a specific draft that cites the note is used", async () => {
  const draft = await draftBrokerEmail(journey, missing, findings, { generate: scripted(goodEmail), models: ["scripted"] });
  assert.equal(draft.source, "model");
  assert.equal(draft.model, "scripted-model");
  assert.equal(draft.text, goodEmail);
  assert.deepEqual(unmentionedFields(draft.text, missing), []);
  assert.deepEqual(inventedFigures(draft.text, draftContext(journey, missing, findings)), []);
});

test("mocked model: a draft with an invented dollar figure falls back to the template", async () => {
  const invented = "Your note mentions a 2019 water claim; we assume around $60,000 paid. Please send the five-year loss run and confirm the effective and expiration dates.";
  const draft = await draftBrokerEmail(journey, missing, findings, { generate: scripted(invented), models: ["scripted"] });
  assert.equal(draft.source, "template");
  assert.match(draft.fallbackReason ?? "", /invented.*\$60,000/);
});

test("mocked model: a draft that skips a missing field falls back to the template", async () => {
  const partial = "Could you send the five-year loss run for Journey property? Thanks.";
  const draft = await draftBrokerEmail(journey, missing, findings, { generate: scripted(partial), models: ["scripted"] });
  assert.equal(draft.source, "template");
  assert.match(draft.fallbackReason ?? "", /effective date/);
});

test("mocked model: failures, timeouts and malformed JSON never throw", async () => {
  const cases: Generate[] = [
    async () => { throw Object.assign(new Error("timeout"), { status: 408 }); },
    async () => { throw new Error("network down"); },
    async () => ({ text: "{ not json" }),
    async () => ({ text: JSON.stringify({ email: 42 }) }),
    async () => ({ text: undefined }),
  ];
  for (const generate of cases) {
    const events: string[] = [];
    const draft = await draftBrokerEmail(journey, missing, findings, { generate, models: ["a", "b"], onEvent: (event) => { events.push(`${event.event}:${event.model}`); } });
    assert.equal(draft.source, "template");
    assert.equal(draft.text, templateBrokerEmail(missing));
    assert.ok(events.includes("started:a"), events.join(","));
  }
});

test("Gemini waterfall moves past server and per-model quota errors and stops on an auth error", async () => {
  const called: string[] = [];
  const draft = await draftBrokerEmail(journey, missing, findings, {
    models: ["first", "second", "third"],
    generate: async (model) => { called.push(model); if (model === "first") throw { status: 503 }; if (model === "second") throw { status: 429 }; return { text: JSON.stringify({ email: goodEmail }) }; },
  });
  assert.deepEqual(called, ["first", "second", "third"]);
  assert.equal(draft.source, "model");
  const denied: string[] = [];
  const stopped = await draftBrokerEmail(journey, missing, findings, { models: ["first", "second"], generate: async (model) => { denied.push(model); throw { status: 401 }; } });
  assert.deepEqual(denied, ["first"]);
  assert.equal(stopped.source, "template");
  assert.match(stopped.fallbackReason ?? "", /401/);
});

test("figures: money, percentages, suffixes and years count; small counts do not", () => {
  const context = "Premium's about 48k, policy runs Jan 1 to Dec 31 2026. Construction is 75 percent masonry. TIV $75,000,000.";
  assert.deepEqual(inventedFigures("Premium $48,000; 75% eligible; effective 2026-01-01; $75M TIV; 2 claims in 3 years; 0-100", context), []);
  assert.deepEqual(inventedFigures("about $52,000 and built in 1998", context), ["$52,000", "1998"]);
  assert.deepEqual(inventedFigures("1.5M limit", context), ["1.5M"]);
});

test("unmentionedFields accepts plain-language references to each factor", () => {
  const text = "Please send the loss run, confirm the premium, whether this is new business or a renewal, the year the building was built, the eligible construction share, the risk state and the insured name.";
  assert.deepEqual(unmentionedFields(text, ["Five-year loss value", "Total premium", "Submission type", "Building age", "Construction mix", "Primary risk state", "account name"]), []);
  assert.deepEqual(unmentionedFields("Please send the loss run.", ["Five-year loss value", "Total premium", "Construction mix"]), ["Total premium", "Construction mix"]);
});
