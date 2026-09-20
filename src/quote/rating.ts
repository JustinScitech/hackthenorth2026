import type { AutoQuoteInput, QuoteEstimate, QuoteFactor, QuoteQuestion, QuoteResult, TenantQuoteInput } from "./types";

/**
 * Fictional demo rate tables. They exist so the quoting journey can be shown
 * end to end; they are not filed rates, and the output is always an estimate
 * range plus a next step, never a bound policy.
 */
export const DISCLAIMER = "This estimate comes from a demo rate table. A licensed advisor confirms the final premium and coverage before anything is bound.";

export const provinces: Record<string, { name: string; tenant: number; auto: number; publicAuto: boolean }> = {
  AB: { name: "Alberta", tenant: 1.1, auto: 1.15, publicAuto: false },
  BC: { name: "British Columbia", tenant: 1.05, auto: 1.2, publicAuto: true },
  MB: { name: "Manitoba", tenant: 1.0, auto: 1.0, publicAuto: true },
  NB: { name: "New Brunswick", tenant: 0.95, auto: 0.95, publicAuto: false },
  NL: { name: "Newfoundland and Labrador", tenant: 1.0, auto: 1.05, publicAuto: false },
  NS: { name: "Nova Scotia", tenant: 0.95, auto: 0.95, publicAuto: false },
  NT: { name: "Northwest Territories", tenant: 1.0, auto: 1.0, publicAuto: false },
  NU: { name: "Nunavut", tenant: 1.0, auto: 1.0, publicAuto: false },
  ON: { name: "Ontario", tenant: 1.0, auto: 1.25, publicAuto: false },
  PE: { name: "Prince Edward Island", tenant: 0.95, auto: 0.9, publicAuto: false },
  QC: { name: "Quebec", tenant: 0.9, auto: 0.75, publicAuto: false },
  SK: { name: "Saskatchewan", tenant: 1.0, auto: 1.0, publicAuto: true },
  YT: { name: "Yukon", tenant: 1.0, auto: 1.0, publicAuto: false },
};

const normalizeProvince = (value: string | null | undefined) => {
  const code = value?.trim().toUpperCase() ?? "";
  return code in provinces ? code : null;
};
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

function estimateFrom(annual: number): QuoteEstimate {
  const rounded = Math.round(annual);
  const annualLow = Math.round(rounded * 0.9), annualHigh = Math.round(rounded * 1.1);
  return { currency: "CAD", annual: rounded, annualLow, annualHigh, monthlyLow: Math.round(annualLow / 12), monthlyHigh: Math.round(annualHigh / 12) };
}

type Draft = { questions: QuoteQuestion[]; factors: QuoteFactor[]; assumptions: string[]; nextSteps: string[]; referrals: string[] };
const draft = (): Draft => ({ questions: [], factors: [], assumptions: [], nextSteps: [], referrals: [] });

function finish(product: QuoteResult["product"], state: Draft, annual: number | null, required: string[]): QuoteResult {
  const missingRequired = state.questions.filter((question) => required.includes(question.field));
  if (state.referrals.length) {
    return {
      product, status: "refer", estimate: null,
      recommendation: `An advisor needs to look at this one before we can estimate a price: ${state.referrals.join("; ")}.`,
      nextSteps: [...state.nextSteps, "Speak with a licensed advisor, who can review the details and quote the right coverage."],
      questions: state.questions, factors: state.factors, assumptions: state.assumptions, disclaimer: DISCLAIMER,
    };
  }
  if (missingRequired.length || annual === null) {
    return {
      product, status: "needs_info", estimate: null,
      recommendation: `We need ${missingRequired.length === 1 ? "one more detail" : "a few more details"} before we can show an estimate.`,
      nextSteps: ["Answer the questions below and the estimate will update right away."],
      questions: state.questions, factors: state.factors, assumptions: state.assumptions, disclaimer: DISCLAIMER,
    };
  }
  const estimate = estimateFrom(annual);
  return {
    product, status: "estimate", estimate,
    recommendation: `Expect roughly $${estimate.monthlyLow}-$${estimate.monthlyHigh} a month (about $${estimate.annualLow}-$${estimate.annualHigh} a year)${state.questions.length ? "; answering the remaining questions will tighten the range" : ""}.`,
    nextSteps: [...state.nextSteps, state.questions.length ? "Answer the remaining questions to refine the estimate." : "Continue to an advisor to confirm coverage and start the policy."],
    questions: state.questions, factors: state.factors, assumptions: state.assumptions, disclaimer: DISCLAIMER,
  };
}

export function quoteTenant(input: TenantQuoteInput): QuoteResult {
  const state = draft();
  const ask = (field: string, question: string, why: string) => state.questions.push({ field, question, why });
  const province = normalizeProvince(input.province);
  if (!province) ask("province", "Which province or territory do you live in?", "Rates and required coverage differ by province.");
  const contents = typeof input.contentsValue === "number" && Number.isFinite(input.contentsValue) && input.contentsValue > 0 ? input.contentsValue : null;
  if (contents === null) ask("contentsValue", "Roughly how much would it cost to replace everything you own?", "Your belongings are what a tenant policy covers, so this sets the coverage amount.");
  else if (contents > 100_000) state.referrals.push("belongings worth more than $100,000 need a tailored contents limit");

  const deductible = input.deductible ?? null;
  if (deductible === null) { ask("deductible", "How much would you be comfortable paying yourself on a claim?", "A higher deductible lowers the price; a lower one costs a little more each month."); state.assumptions.push("A $1,000 deductible is assumed until you choose one."); }
  const liability = input.liabilityLimit ?? null;
  if (liability === null) { ask("liabilityLimit", "Would you like $1 million or $2 million of liability protection?", "Liability covers accidental damage or injury you cause to others; most landlords ask for at least $1 million."); state.assumptions.push("$1 million liability is assumed."); }
  const claims = isCount(input.priorClaims) ? input.priorClaims : null;
  if (claims === null) { ask("priorClaims", "Have you made any home or tenant insurance claims in the last five years?", "Recent claims affect the price and help us give an accurate estimate."); state.assumptions.push("No prior claims are assumed."); }
  else if (claims >= 3) state.referrals.push("three or more claims in five years need an advisor's review");
  if (input.smokeDetectors === null || input.smokeDetectors === undefined) ask("smokeDetectors", "Does your home have working smoke detectors?", "Smoke detectors reduce fire damage and earn a better rate.");
  if (input.sprinklers === null || input.sprinklers === undefined) ask("sprinklers", "Is the building protected by a sprinkler system?", "Sprinklered buildings qualify for a discount.");

  if (!province || contents === null || state.referrals.length) return finish("tenant", state, null, ["province", "contentsValue"]);

  let annual = 240 + Math.max(0, contents - 20_000) * 0.006;
  state.factors.push({ label: "Belongings covered", effect: contents > 20_000 ? "increases" : "neutral", detail: `$${contents.toLocaleString("en-CA")} of contents; the first $20,000 is included in the base price.` });
  const deductibleFactor = { 500: 1.1, 1000: 0.9, 2500: 0.8 }[deductible ?? 1000];
  annual *= deductibleFactor;
  state.factors.push({ label: "Deductible", effect: deductibleFactor > 1 ? "increases" : "decreases", detail: `$${(deductible ?? 1000).toLocaleString("en-CA")} deductible.` });
  if ((liability ?? 1_000_000) === 2_000_000) { annual += 30; state.factors.push({ label: "Liability limit", effect: "increases", detail: "$2 million liability adds a small amount over $1 million." }); }
  const claimFactor = [1, 1.15, 1.35][claims ?? 0];
  if (claimFactor > 1) { annual *= claimFactor; state.factors.push({ label: "Prior claims", effect: "increases", detail: `${claims} claim${claims === 1 ? "" : "s"} in the last five years.` }); }
  if (input.smokeDetectors === false) { annual *= 1.1; state.factors.push({ label: "Smoke detectors", effect: "increases", detail: "No working smoke detectors reported." }); state.nextSteps.push("Install working smoke detectors; it lowers the price and keeps you safer."); }
  if (input.sprinklers === true) { annual *= 0.95; state.factors.push({ label: "Sprinklers", effect: "decreases", detail: "Sprinklered building discount." }); }
  annual *= provinces[province].tenant;
  state.factors.push({ label: "Province", effect: provinces[province].tenant > 1 ? "increases" : provinces[province].tenant < 1 ? "decreases" : "neutral", detail: `${provinces[province].name} rate level.` });
  return finish("tenant", state, annual, ["province", "contentsValue"]);
}

export function quoteAuto(input: AutoQuoteInput): QuoteResult {
  const state = draft();
  const ask = (field: string, question: string, why: string) => state.questions.push({ field, question, why });
  const thisYear = new Date().getFullYear();
  const province = normalizeProvince(input.province);
  if (!province) ask("province", "Which province or territory is the car registered in?", "Auto insurance rules and prices are set provincially.");
  const age = isCount(input.driverAge) && input.driverAge >= 16 && input.driverAge <= 100 ? input.driverAge : null;
  if (age === null) ask("driverAge", "How old is the main driver?", "Driver age is one of the biggest factors in an auto rate, and the driver must be licensed and at least 16.");
  const vehicleYear = isCount(input.vehicleYear) && input.vehicleYear >= 1900 && input.vehicleYear <= thisYear + 1 ? input.vehicleYear : null;
  if (vehicleYear === null) ask("vehicleYear", "What year is the vehicle?", "The vehicle's age affects its value and repair cost.");
  else if (thisYear - vehicleYear > 25) state.referrals.push("vehicles more than 25 years old are insured as classics");
  if (typeof input.vehicleValue === "number" && input.vehicleValue > 100_000) state.referrals.push("vehicles worth more than $100,000 need a specialty policy");

  const licensed = isCount(input.yearsLicensed) ? input.yearsLicensed : null;
  if (licensed === null) { ask("yearsLicensed", "How many years has the main driver been licensed?", "Experience behind the wheel lowers the rate."); state.assumptions.push("At least three years of driving experience is assumed."); }
  const accidents = isCount(input.atFaultAccidents) ? input.atFaultAccidents : null;
  if (accidents === null) { ask("atFaultAccidents", "Any at-fault accidents in the last six years?", "Recent at-fault accidents raise the price; we would rather ask than guess."); state.assumptions.push("No at-fault accidents are assumed."); }
  else if (accidents >= 3) state.referrals.push("three or more at-fault accidents need an advisor's review");
  const convictions = isCount(input.convictions) ? input.convictions : null;
  if (convictions === null) { ask("convictions", "Any driving convictions, such as speeding tickets, in the last three years?", "Convictions affect the rate."); state.assumptions.push("No convictions are assumed."); }
  else if (convictions >= 3) state.referrals.push("three or more convictions need an advisor's review");
  if (!input.usage) { ask("usage", "Is the car for pleasure, commuting, or business?", "How the car is used changes how much it is on the road."); state.assumptions.push("Commuting use is assumed."); }
  if (!isCount(input.annualKm)) { ask("annualKm", "About how many kilometres do you drive a year?", "Lower mileage earns a discount."); state.assumptions.push("About 15,000 km a year is assumed."); }
  if (!input.coverage) { ask("coverage", "Do you want liability only, standard coverage, or full coverage with collision and comprehensive?", "Coverage level is the biggest choice you make about price."); state.assumptions.push("Standard coverage is assumed."); }
  if (input.winterTires === null || input.winterTires === undefined) ask("winterTires", "Do you use winter tires?", "Winter tires earn a discount in most provinces.");

  if (province && provinces[province].publicAuto) {
    state.referrals.push(`basic auto insurance in ${provinces[province].name} is sold by the public insurer`);
    state.nextSteps.push(`Buy basic coverage from the public insurer in ${provinces[province].name} (for example ICBC, SGI, or MPI), then ask an advisor about optional extra coverage.`);
  }
  if (!province || age === null || vehicleYear === null || state.referrals.length) return finish("auto", state, null, ["province", "driverAge", "vehicleYear"]);

  let annual = 1200 * provinces[province].auto;
  state.factors.push({ label: "Province", effect: provinces[province].auto > 1 ? "increases" : provinces[province].auto < 1 ? "decreases" : "neutral", detail: `${provinces[province].name} rate level.` });
  const ageFactor = age < 25 ? 1.6 : age <= 30 ? 1.2 : age <= 65 ? 1 : 1.1;
  annual *= ageFactor;
  state.factors.push({ label: "Driver age", effect: ageFactor > 1 ? "increases" : "neutral", detail: `Main driver is ${age}.` });
  if ((licensed ?? 3) < 3) { annual *= 1.3; state.factors.push({ label: "Driving experience", effect: "increases", detail: `${licensed} year${licensed === 1 ? "" : "s"} licensed.` }); }
  const accidentFactor = [1, 1.3, 1.7][accidents ?? 0];
  if (accidentFactor > 1) { annual *= accidentFactor; state.factors.push({ label: "At-fault accidents", effect: "increases", detail: `${accidents} at-fault accident${accidents === 1 ? "" : "s"} in the last six years.` }); }
  if ((convictions ?? 0) > 0) { annual *= 1.15 ** (convictions ?? 0); state.factors.push({ label: "Convictions", effect: "increases", detail: `${convictions} conviction${convictions === 1 ? "" : "s"} in the last three years.` }); }
  const usage = input.usage ?? "commute";
  const usageFactor = { pleasure: 1, commute: 1.1, business: 1.3 }[usage];
  state.factors.push({ label: "Vehicle use", effect: usageFactor > 1 ? "increases" : "neutral", detail: `${usage === "commute" ? "Commuting" : usage === "business" ? "Business" : "Pleasure"} use.` });
  annual *= usageFactor;
  const km = isCount(input.annualKm) ? input.annualKm : 15_000;
  const kmFactor = km > 25_000 ? 1.15 : km < 8_000 ? 0.9 : 1;
  if (kmFactor !== 1) { annual *= kmFactor; state.factors.push({ label: "Annual mileage", effect: kmFactor > 1 ? "increases" : "decreases", detail: `${km.toLocaleString("en-CA")} km a year.` }); }
  const coverage = input.coverage ?? "standard";
  const coverageFactor = { liability_only: 0.55, standard: 1, full: 1.2 }[coverage];
  annual *= coverageFactor;
  state.factors.push({ label: "Coverage level", effect: coverageFactor > 1 ? "increases" : coverageFactor < 1 ? "decreases" : "neutral", detail: coverage === "full" ? "Full coverage with collision and comprehensive." : coverage === "liability_only" ? "Liability only; repairs to your own car come out of pocket." : "Standard coverage." });
  if (input.winterTires === true) { annual *= 0.95; state.factors.push({ label: "Winter tires", effect: "decreases", detail: "Winter tire discount." }); }
  return finish("auto", state, annual, ["province", "driverAge", "vehicleYear"]);
}
