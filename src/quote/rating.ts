import type { AutoQuoteInput, QuoteResult, TenantQuoteInput } from "./types";

/** Fictional demo rate tables; see evals/suites/quote.ts for the behaviour these must satisfy. */
export function quoteTenant(_input: TenantQuoteInput): QuoteResult {
  throw new Error("quoteTenant is not implemented yet");
}

export function quoteAuto(_input: AutoQuoteInput): QuoteResult {
  throw new Error("quoteAuto is not implemented yet");
}
