import { z } from "zod";
import { geminiJson, geminiModels, openaiJson, openaiModel, type JsonResponse } from "../agent/providers";
import type { AutoQuoteInput, QuoteRequest, TenantQuoteInput } from "./types";

/**
 * Optional model pass over a free-text quote request. It only fills fields
 * the deterministic parser left empty and never overrides one it set, so the
 * evals on parseQuoteRequest remain the floor for what the assistant hears.
 */
const nullable = <T extends z.ZodTypeAny>(schema: T) => schema.nullable().optional();
const responseSchema = z.object({
  product: nullable(z.enum(["tenant", "auto"])),
  province: nullable(z.string().length(2)),
  contentsValue: nullable(z.number().positive()),
  deductible: nullable(z.union([z.literal(500), z.literal(1000), z.literal(2500)])),
  liabilityLimit: nullable(z.union([z.literal(1_000_000), z.literal(2_000_000)])),
  buildingType: nullable(z.enum(["apartment", "condo", "house", "basement"])),
  priorClaims: nullable(z.number().int().min(0).max(20)),
  smokeDetectors: nullable(z.boolean()),
  sprinklers: nullable(z.boolean()),
  driverAge: nullable(z.number().int().min(0).max(120)),
  yearsLicensed: nullable(z.number().int().min(0).max(100)),
  vehicleYear: nullable(z.number().int().min(1900).max(2100)),
  vehicleMake: nullable(z.string().max(40)),
  vehicleModel: nullable(z.string().max(40)),
  vehicleValue: nullable(z.number().positive()),
  annualKm: nullable(z.number().int().min(0).max(500_000)),
  usage: nullable(z.enum(["pleasure", "commute", "business"])),
  atFaultAccidents: nullable(z.number().int().min(0).max(20)),
  convictions: nullable(z.number().int().min(0).max(20)),
  coverage: nullable(z.enum(["liability_only", "standard", "full"])),
  winterTires: nullable(z.boolean()),
});
type ModelFacts = z.infer<typeof responseSchema>;

const PROMPT = 'You read a person\'s request for Canadian tenant (renters) or auto insurance and return only JSON with these keys, using null for anything the text does not state explicitly: product ("tenant"|"auto"|null), province (two-letter code), contentsValue (CAD), deductible (500|1000|2500), liabilityLimit (1000000|2000000), buildingType ("apartment"|"condo"|"house"|"basement"), priorClaims, smokeDetectors, sprinklers, driverAge, yearsLicensed, vehicleYear, vehicleMake, vehicleModel, vehicleValue (CAD), annualKm, usage ("pleasure"|"commute"|"business"), atFaultAccidents, convictions, coverage ("liability_only"|"standard"|"full"), winterTires. Map cities to their province. Never guess; a vehicle\'s value is not the value of belongings.';
const openaiSchema = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(responseSchema.shape),
  properties: Object.fromEntries(Object.keys(responseSchema.shape).map((key) => [key, {
    type: ["product", "province", "buildingType", "vehicleMake", "vehicleModel", "usage", "coverage"].includes(key) ? ["string", "null"]
      : ["smokeDetectors", "sprinklers", "winterTires"].includes(key) ? ["boolean", "null"] : ["number", "null"],
  }])),
};

export function modelIntakeAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
}

/** A person is waiting, so every provider gets one quick attempt and the whole pass has a deadline. */
const INTAKE_DEADLINE_MS = 14_000;
const single = { retries: 1, timeoutMs: 10_000 };

async function usable(call: () => Promise<JsonResponse>): Promise<{ facts: ModelFacts; model: string }> {
  const response = await call();
  if (!response.text) throw new Error("Empty model response");
  const parsed = responseSchema.safeParse(JSON.parse(response.text));
  if (!parsed.success) throw new Error("Model response did not match the intake schema");
  return { facts: parsed.data, model: response.modelVersion ?? "model" };
}

/** Every configured provider races; the first valid answer wins, so one slow or over-quota model cannot stall the page. */
async function firstUsable(text: string): Promise<{ facts: ModelFacts; model: string } | null> {
  const calls: (() => Promise<JsonResponse>)[] = [];
  if (process.env.OPENAI_API_KEY) calls.push(() => openaiJson(openaiModel(), PROMPT, text, openaiSchema, single));
  if (process.env.GEMINI_API_KEY) for (const model of geminiModels().slice(0, 3)) calls.push(() => geminiJson(model, PROMPT, text, single));
  if (!calls.length) return null;
  try {
    return await Promise.any(calls.map((call) => usable(call)));
  } catch (error) {
    const reasons = error instanceof AggregateError ? error.errors.map((item) => (item instanceof Error ? item.name : "UnknownError")) : ["UnknownError"];
    console.warn("Quote intake models unavailable", reasons.join(", "));
    return null;
  }
}

export async function modelQuoteFacts(text: string): Promise<{ facts: ModelFacts; model: string } | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), INTAKE_DEADLINE_MS); });
  try { return await Promise.race([firstUsable(text), deadline]); }
  finally { clearTimeout(timer); }
}

/** Fills only the fields the parser left empty. */
export function mergeModelFacts(request: QuoteRequest, facts: ModelFacts): QuoteRequest {
  const tenant: TenantQuoteInput = { ...request.tenant };
  const auto: AutoQuoteInput = { ...request.auto };
  const fill = <T extends object>(target: T, key: keyof T, value: unknown) => {
    if ((target[key] === undefined || target[key] === null) && value !== null && value !== undefined) (target as Record<string, unknown>)[key as string] = value;
  };
  for (const key of ["province", "contentsValue", "deductible", "liabilityLimit", "buildingType", "priorClaims", "smokeDetectors", "sprinklers"] as const) fill(tenant, key, facts[key]);
  for (const key of ["province", "driverAge", "yearsLicensed", "vehicleYear", "vehicleMake", "vehicleModel", "vehicleValue", "annualKm", "usage", "atFaultAccidents", "convictions", "coverage", "winterTires"] as const) fill(auto, key, facts[key]);
  return { product: request.product ?? facts.product ?? null, tenant, auto };
}
