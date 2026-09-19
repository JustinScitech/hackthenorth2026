import { NextResponse } from "next/server";
import { z } from "zod";
import { parseQuoteRequest } from "@/quote/intake";
import { mergeModelFacts, modelIntakeAvailable, modelQuoteFacts } from "@/quote/model-intake";
import { quoteAuto, quoteTenant } from "@/quote/rating";
import type { AutoQuoteInput, QuoteRequest, TenantQuoteInput } from "@/quote/types";

export const runtime = "nodejs";

const nullable = <T extends z.ZodTypeAny>(schema: T) => schema.nullable().optional();
const answersSchema = z.object({
  province: nullable(z.string().trim().max(2)),
  contentsValue: nullable(z.number().min(0).max(10_000_000)),
  deductible: nullable(z.union([z.literal(500), z.literal(1000), z.literal(2500)])),
  liabilityLimit: nullable(z.union([z.literal(1_000_000), z.literal(2_000_000)])),
  buildingType: nullable(z.enum(["apartment", "condo", "house", "basement"])),
  priorClaims: nullable(z.number().int().min(0).max(50)),
  smokeDetectors: nullable(z.boolean()),
  sprinklers: nullable(z.boolean()),
  driverAge: nullable(z.number().int().min(0).max(120)),
  yearsLicensed: nullable(z.number().int().min(0).max(100)),
  vehicleYear: nullable(z.number().int().min(1900).max(2100)),
  vehicleMake: nullable(z.string().trim().max(40)),
  vehicleModel: nullable(z.string().trim().max(40)),
  vehicleValue: nullable(z.number().min(0).max(10_000_000)),
  annualKm: nullable(z.number().int().min(0).max(500_000)),
  usage: nullable(z.enum(["pleasure", "commute", "business"])),
  atFaultAccidents: nullable(z.number().int().min(0).max(50)),
  convictions: nullable(z.number().int().min(0).max(50)),
  coverage: nullable(z.enum(["liability_only", "standard", "full"])),
  winterTires: nullable(z.boolean()),
});
const bodySchema = z.object({
  product: nullable(z.enum(["tenant", "auto"])),
  text: nullable(z.string().max(4000)),
  answers: answersSchema.optional(),
});

/**
 * Public quoting endpoint for the Intact prototype. Free text is read by the
 * deterministic parser, optionally topped up by a model, then explicit answers
 * from the form override both. No account or session is needed; nothing is stored.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "Use the quote page on this site." }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the details and try again." }, { status: 400 });
  const { product: chosen, text, answers = {} } = parsed.data;

  let intake: QuoteRequest = text?.trim() ? parseQuoteRequest(text) : { product: null, tenant: {}, auto: {} };
  let model: string | null = null;
  if (text?.trim() && modelIntakeAvailable()) {
    const facts = await modelQuoteFacts(text);
    if (facts) { intake = mergeModelFacts(intake, facts.facts); model = facts.model; }
  }
  const defined = Object.fromEntries(Object.entries(answers).filter(([, value]) => value !== undefined));
  const tenant: TenantQuoteInput = { ...intake.tenant, ...defined };
  const auto: AutoQuoteInput = { ...intake.auto, ...defined };
  const product = chosen ?? intake.product;
  const result = product === "tenant" ? quoteTenant(tenant) : product === "auto" ? quoteAuto(auto) : null;
  return NextResponse.json({
    product,
    // Everything understood so far, flat, so the page can carry it into the next turn.
    heard: Object.fromEntries(Object.entries(product === "tenant" ? tenant : product === "auto" ? auto : { ...tenant, ...auto }).filter(([, value]) => value !== null && value !== undefined)),
    result,
    model,
  }, { headers: { "Cache-Control": "no-store" } });
}
