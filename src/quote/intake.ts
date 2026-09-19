import type { QuoteRequest } from "./types";

/** Pulls quoting facts out of a free-text request; only facts the text states, never guesses. */
export function parseQuoteRequest(_text: string): QuoteRequest {
  throw new Error("parseQuoteRequest is not implemented yet");
}
