import { parseQuoteRequest } from "../../src/quote/intake";
import { quoteAuto, quoteTenant } from "../../src/quote/rating";
import type { AutoQuoteInput, QuoteResult, TenantQuoteInput } from "../../src/quote/types";
import { attempt, same, type CaseResult, type Suite } from "../runner";

/**
 * Intact challenge: a person gives what they know and gets an estimate,
 * a recommendation, or a clear next step. The rate tables are fictional, so
 * most cases pin behaviour rather than dollars: what is required before an
 * estimate can be shown, which situations must go to a person, that every
 * question explains why it is asked, and that riskier inputs never price lower.
 */
const tenantBase: TenantQuoteInput = { province: "ON", contentsValue: 30_000, deductible: 1000, liabilityLimit: 1_000_000, buildingType: "apartment", priorClaims: 0, smokeDetectors: true, sprinklers: false };
const autoBase: AutoQuoteInput = { province: "ON", driverAge: 35, yearsLicensed: 15, vehicleYear: 2019, vehicleMake: "Honda", vehicleModel: "Civic", vehicleValue: 25_000, annualKm: 15_000, usage: "commute", atFaultAccidents: 0, convictions: 0, coverage: "standard", winterTires: true };

/** Contract every quote result must honour regardless of product or status. */
function contract(result: QuoteResult): string[] {
  const problems: string[] = [];
  if (!/estimate|not a (?:binding )?quote|does not bind/i.test(result.disclaimer)) problems.push("disclaimer must say this is an estimate, not a bound policy");
  if (!result.recommendation.trim() || result.recommendation.split(/\s+/).length > 60) problems.push("recommendation must be short plain language");
  if (!result.nextSteps.length) problems.push("at least one next step is required");
  for (const question of result.questions) {
    if (!question.why.trim() || !question.question.trim().endsWith("?")) problems.push(`question "${question.field}" needs a question mark and a reason`);
    if (/[_]/.test(question.question) || /[_]/.test(question.why)) problems.push(`question "${question.field}" leaks a field name into user text`);
  }
  if (result.status === "estimate") {
    if (!result.estimate) problems.push("estimate status needs an estimate");
    else {
      const { annual, annualLow, annualHigh, monthlyLow, monthlyHigh } = result.estimate;
      if (!(annualLow <= annual && annual <= annualHigh)) problems.push("annual must sit inside its range");
      if (Math.abs(monthlyLow * 12 - annualLow) > 12 || Math.abs(monthlyHigh * 12 - annualHigh) > 12) problems.push("monthly must be annual over twelve");
      if (annualLow <= 0) problems.push("estimate must be positive");
    }
  } else if (result.estimate && result.status === "needs_info") problems.push("no estimate may be shown while required facts are missing");
  if (result.status === "needs_info" && !result.questions.length) problems.push("needs_info must ask at least one question");
  return problems;
}

const annual = (result: QuoteResult) => result.estimate?.annual ?? Number.NaN;

const tenantCases: { name: string; input: TenantQuoteInput; check: (result: QuoteResult) => string[]; note?: string }[] = [
  { name: "complete tenant request produces the pinned demo estimate", input: tenantBase, check: (r) => [r.status === "estimate" ? "" : `status ${r.status}`, r.estimate?.annual === 270 ? "" : `annual ${r.estimate?.annual} expected 270`, r.estimate?.annualLow === 243 && r.estimate?.annualHigh === 297 ? "" : `range ${r.estimate?.annualLow}-${r.estimate?.annualHigh} expected 243-297`, r.estimate?.currency === "CAD" ? "" : "currency must be CAD"].filter(Boolean), note: "Base $240 + 0.6% of contents above $20K, times the $1,000-deductible factor 0.9." },
  { name: "province and contents are required before any estimate", input: { deductible: 1000 }, check: (r) => [r.status === "needs_info" ? "" : `status ${r.status}`, ["province", "contentsValue"].every((field) => r.questions.some((q) => q.field === field)) ? "" : `questions ${r.questions.map((q) => q.field)}`].filter(Boolean) },
  { name: "optional facts become assumptions, not blockers", input: { province: "QC", contentsValue: 25_000 }, check: (r) => [r.status === "estimate" ? "" : `status ${r.status}`, r.assumptions.length >= 2 ? "" : "assumptions for deductible and claims expected", r.questions.some((q) => q.field === "priorClaims") ? "" : "should still ask about prior claims"].filter(Boolean), note: "A partial quote is allowed by the brief; the assumptions make it honest." },
  { name: "higher deductible costs less", input: { ...tenantBase, deductible: 2500 }, check: (r) => [annual(r) < annual(quoteTenant(tenantBase)) ? "" : "2500 deductible should be cheaper than 1000", r.factors.some((f) => f.effect === "decreases" && /deductible/i.test(f.label)) ? "" : "deductible factor should be explained"].filter(Boolean) },
  { name: "lower deductible costs more", input: { ...tenantBase, deductible: 500 }, check: (r) => [annual(r) > annual(quoteTenant(tenantBase)) ? "" : "500 deductible should cost more"].filter(Boolean) },
  { name: "prior claims raise the estimate and are explained", input: { ...tenantBase, priorClaims: 2 }, check: (r) => [annual(r) > annual(quoteTenant(tenantBase)) ? "" : "two claims should cost more", r.factors.some((f) => f.effect === "increases" && /claim/i.test(f.label)) ? "" : "claims factor should be explained"].filter(Boolean) },
  { name: "three or more claims go to a person", input: { ...tenantBase, priorClaims: 3 }, check: (r) => [r.status === "refer" ? "" : `status ${r.status}`, r.estimate === null ? "" : "no estimate on referral", r.nextSteps.some((s) => /advisor|agent|person|call|speak/i.test(s)) ? "" : "next step should hand off to a person"].filter(Boolean) },
  { name: "very high contents go to a person", input: { ...tenantBase, contentsValue: 150_000 }, check: (r) => [r.status === "refer" ? "" : `status ${r.status}`].filter(Boolean) },
  { name: "no smoke detectors is a safety recommendation, not a rejection", input: { ...tenantBase, smokeDetectors: false }, check: (r) => [r.status === "estimate" ? "" : `status ${r.status}`, annual(r) > annual(quoteTenant(tenantBase)) ? "" : "missing detectors should cost more", r.nextSteps.some((s) => /smoke/i.test(s)) ? "" : "should recommend installing detectors"].filter(Boolean) },
  { name: "sprinklers earn a discount", input: { ...tenantBase, sprinklers: true }, check: (r) => [annual(r) < annual(quoteTenant(tenantBase)) ? "" : "sprinklers should reduce the estimate"].filter(Boolean) },
  { name: "two million liability costs more than one", input: { ...tenantBase, liabilityLimit: 2_000_000 }, check: (r) => [annual(r) > annual(quoteTenant(tenantBase)) ? "" : "higher liability should cost more"].filter(Boolean) },
  { name: "unknown province asks rather than guessing", input: { ...tenantBase, province: "ZZ" }, check: (r) => [r.status === "needs_info" ? "" : `status ${r.status}`, r.questions.some((q) => q.field === "province") ? "" : "should ask for the province"].filter(Boolean) },
  { name: "province casing is tolerated", input: { ...tenantBase, province: "on" }, check: (r) => [r.status === "estimate" ? "" : `status ${r.status}`, annual(r) === 270 ? "" : `annual ${annual(r)}`].filter(Boolean) },
  { name: "zero or negative contents value is a question", input: { ...tenantBase, contentsValue: 0 }, check: (r) => [r.status === "needs_info" ? "" : `status ${r.status}`].filter(Boolean) },
];

const autoCases: { name: string; input: AutoQuoteInput; check: (result: QuoteResult) => string[]; note?: string }[] = [
  { name: "complete auto request produces an estimate with explained factors", input: autoBase, check: (r) => [r.status === "estimate" ? "" : `status ${r.status}`, r.factors.length >= 3 ? "" : "factors should be listed", r.factors.some((f) => /winter/i.test(f.label) && f.effect === "decreases") ? "" : "winter tires discount should be explained"].filter(Boolean) },
  { name: "province, driver age, and vehicle year are required", input: { usage: "commute" }, check: (r) => [r.status === "needs_info" ? "" : `status ${r.status}`, ["province", "driverAge", "vehicleYear"].every((field) => r.questions.some((q) => q.field === field)) ? "" : `questions ${r.questions.map((q) => q.field)}`].filter(Boolean) },
  { name: "young driver costs more than an experienced one", input: { ...autoBase, driverAge: 21, yearsLicensed: 3 }, check: (r) => [annual(r) > annual(quoteAuto(autoBase)) ? "" : "21-year-old should cost more"].filter(Boolean) },
  { name: "newly licensed driver costs more at the same age", input: { ...autoBase, yearsLicensed: 1 }, check: (r) => [annual(r) > annual(quoteAuto(autoBase)) ? "" : "one year licensed should cost more"].filter(Boolean) },
  { name: "an at-fault accident raises the estimate", input: { ...autoBase, atFaultAccidents: 1 }, check: (r) => [annual(r) > annual(quoteAuto(autoBase)) ? "" : "accident should cost more", r.factors.some((f) => /accident/i.test(f.label)) ? "" : "accident factor should be explained"].filter(Boolean) },
  { name: "three at-fault accidents go to a person", input: { ...autoBase, atFaultAccidents: 3 }, check: (r) => [r.status === "refer" ? "" : `status ${r.status}`, r.estimate === null ? "" : "no estimate on referral"].filter(Boolean) },
  { name: "liability-only is cheaper than full coverage", input: { ...autoBase, coverage: "liability_only" }, check: (r) => [annual(r) < annual(quoteAuto({ ...autoBase, coverage: "full" })) ? "" : "liability-only should be cheaper"].filter(Boolean) },
  { name: "business use costs more than pleasure use", input: { ...autoBase, usage: "business" }, check: (r) => [annual(r) > annual(quoteAuto({ ...autoBase, usage: "pleasure" })) ? "" : "business use should cost more"].filter(Boolean) },
  { name: "low mileage earns a discount", input: { ...autoBase, annualKm: 5_000 }, check: (r) => [annual(r) < annual(quoteAuto(autoBase)) ? "" : "5,000 km should be cheaper"].filter(Boolean) },
  { name: "public-insurer provinces explain the next step instead of quoting basic coverage", input: { ...autoBase, province: "BC" }, check: (r) => [r.status === "refer" ? "" : `status ${r.status}`, /public|ICBC|government/i.test(r.recommendation + r.nextSteps.join(" ")) ? "" : "should explain the public insurer"].filter(Boolean), note: "Basic auto insurance in BC, SK, and MB is sold by public insurers; a private quote would mislead." },
  { name: "classic vehicles go to a person", input: { ...autoBase, vehicleYear: 1985 }, check: (r) => [r.status === "refer" ? "" : `status ${r.status}`].filter(Boolean) },
  { name: "a driver under sixteen cannot be quoted", input: { ...autoBase, driverAge: 15 }, check: (r) => [r.status === "needs_info" ? "" : `status ${r.status}`, r.questions.some((q) => q.field === "driverAge") ? "" : "should ask about the driver"].filter(Boolean) },
  { name: "future vehicle year is a question", input: { ...autoBase, vehicleYear: new Date().getFullYear() + 2 }, check: (r) => [r.status === "needs_info" ? "" : `status ${r.status}`].filter(Boolean) },
  { name: "Quebec is priced lower than Ontario", input: { ...autoBase, province: "QC" }, check: (r) => [annual(r) < annual(quoteAuto(autoBase)) ? "" : "QC should be cheaper than ON in the demo table"].filter(Boolean) },
];

/** Conversational intake: what a person typed, what the parser must and must not take from it. */
const intakeCases: { name: string; text: string; expected: { product: "tenant" | "auto" | null; tenant?: Partial<TenantQuoteInput>; auto?: Partial<AutoQuoteInput> }; note?: string }[] = [
  { name: "tenant request with city and contents", text: "Hi, I need renters insurance for my apartment in Toronto, I have about $20,000 worth of stuff and no claims.", expected: { product: "tenant", tenant: { province: "ON", contentsValue: 20_000, priorClaims: 0, buildingType: "apartment" } } },
  { name: "auto request with age, car, and commute", text: "I'm 28, live in Montreal, and drive a 2019 Honda Civic to work, about 15,000 km a year.", expected: { product: "auto", auto: { province: "QC", driverAge: 28, vehicleYear: 2019, vehicleMake: "Honda", vehicleModel: "Civic", usage: "commute", annualKm: 15_000 } } },
  { name: "explicit province code", text: "Car insurance in AB for a 2021 Toyota RAV4, I'm 40 and have been driving for 20 years.", expected: { product: "auto", auto: { province: "AB", vehicleYear: 2021, vehicleMake: "Toyota", vehicleModel: "RAV4", driverAge: 40, yearsLicensed: 20 } } },
  { name: "claims and deductible for a condo", text: "Tenant insurance for a condo in Vancouver. One claim two years ago. I'd like a $1,000 deductible.", expected: { product: "tenant", tenant: { province: "BC", buildingType: "condo", priorClaims: 1, deductible: 1000 } } },
  { name: "no product stated", text: "Can you give me a quote? I live in Ottawa.", expected: { product: null, tenant: { province: "ON" }, auto: { province: "ON" } }, note: "The assistant must ask which product, not assume." },
  { name: "vehicle value is not contents value", text: "My car is worth $30,000. I'm 45 in Calgary, 2020 Mazda CX-5, pleasure use only.", expected: { product: "auto", auto: { province: "AB", vehicleValue: 30_000, driverAge: 45, vehicleYear: 2020, usage: "pleasure" }, tenant: { contentsValue: null } } },
  { name: "age is not mistaken for a vehicle year or mileage", text: "Renters insurance, I'm 30 years old in Halifax with $15k of belongings.", expected: { product: "tenant", tenant: { province: "NS", contentsValue: 15_000 }, auto: { driverAge: 30, vehicleYear: null, annualKm: null } } },
  { name: "at-fault accident and conviction counts", text: "Auto quote for Winnipeg, 2018 Ford Escape, age 52, one at-fault accident and one speeding ticket in the last three years.", expected: { product: "auto", auto: { province: "MB", vehicleYear: 2018, driverAge: 52, atFaultAccidents: 1, convictions: 1 } } },
  { name: "nothing usable", text: "hello there", expected: { product: null, tenant: {}, auto: {} } },
  { name: "winter tires and full coverage", text: "Full coverage for a 2022 Hyundai Kona in Ontario, I'm 33, winter tires installed.", expected: { product: "auto", auto: { province: "ON", vehicleYear: 2022, driverAge: 33, coverage: "full", winterTires: true } } },
];

export const quoteSuite: Suite = {
  name: "quote",
  description: "Intact quoting: tenant and auto estimates, required facts, referrals, explained factors, conversational intake",
  async run() {
    const results: CaseResult[] = [];
    for (const item of tenantCases) results.push(attempt(`tenant: ${item.name}`, () => { const r = quoteTenant(item.input); return [...contract(r), ...(r.product === "tenant" ? [] : ["product must be tenant"]), ...item.check(r)]; }, item.note));
    for (const item of autoCases) results.push(attempt(`auto: ${item.name}`, () => { const r = quoteAuto(item.input); return [...contract(r), ...(r.product === "auto" ? [] : ["product must be auto"]), ...item.check(r)]; }, item.note));
    for (const item of intakeCases) results.push(attempt(`intake: ${item.name}`, () => {
      const parsed = parseQuoteRequest(item.text);
      const problems: string[] = [];
      if (parsed.product !== item.expected.product) problems.push(`product ${parsed.product} expected ${item.expected.product}`);
      for (const [field, value] of Object.entries(item.expected.tenant ?? {})) if (!same(parsed.tenant[field as keyof TenantQuoteInput] ?? null, value)) problems.push(`tenant.${field} ${JSON.stringify(parsed.tenant[field as keyof TenantQuoteInput] ?? null)} expected ${JSON.stringify(value)}`);
      for (const [field, value] of Object.entries(item.expected.auto ?? {})) if (!same(parsed.auto[field as keyof AutoQuoteInput] ?? null, value)) problems.push(`auto.${field} ${JSON.stringify(parsed.auto[field as keyof AutoQuoteInput] ?? null)} expected ${JSON.stringify(value)}`);
      return problems;
    }, item.note));
    return results;
  },
};
