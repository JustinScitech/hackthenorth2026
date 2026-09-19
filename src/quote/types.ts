/**
 * Personal-lines quoting (Intact challenge). Every number here comes from a
 * fictional demo rate table; the output is an estimate and a next step, never
 * a bound policy or a regulated premium.
 */
export type Product = "tenant" | "auto";

export type TenantQuoteInput = {
  province?: string | null;
  contentsValue?: number | null;
  deductible?: 500 | 1000 | 2500 | null;
  liabilityLimit?: 1_000_000 | 2_000_000 | null;
  buildingType?: "apartment" | "condo" | "house" | "basement" | null;
  priorClaims?: number | null;
  smokeDetectors?: boolean | null;
  sprinklers?: boolean | null;
};

export type AutoQuoteInput = {
  province?: string | null;
  driverAge?: number | null;
  yearsLicensed?: number | null;
  vehicleYear?: number | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleValue?: number | null;
  annualKm?: number | null;
  usage?: "pleasure" | "commute" | "business" | null;
  atFaultAccidents?: number | null;
  convictions?: number | null;
  coverage?: "liability_only" | "standard" | "full" | null;
  winterTires?: boolean | null;
};

export type QuoteQuestion = { field: string; question: string; why: string };
export type QuoteFactor = { label: string; effect: "increases" | "decreases" | "neutral"; detail: string };
export type QuoteEstimate = { currency: "CAD"; annual: number; annualLow: number; annualHigh: number; monthlyLow: number; monthlyHigh: number };

export type QuoteResult = {
  product: Product;
  /** estimate: a range was produced; needs_info: required facts missing; refer: outside the demo appetite, a person must follow up. */
  status: "estimate" | "needs_info" | "refer";
  estimate: QuoteEstimate | null;
  recommendation: string;
  nextSteps: string[];
  questions: QuoteQuestion[];
  factors: QuoteFactor[];
  assumptions: string[];
  disclaimer: string;
};

/** Facts a conversational intake can pull out of a free-text request before quoting. */
export type QuoteRequest = {
  product: Product | null;
  tenant: TenantQuoteInput;
  auto: AutoQuoteInput;
};
