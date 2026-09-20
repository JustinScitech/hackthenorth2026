/** Published list prices per million tokens, used to put a dollar figure next to each reader. */
export type Price = { input: number; output: number; source: string };
const PRICING_SOURCE = "ai.google.dev/gemini-api/docs/pricing, read 2026-09-20";
export const pricing: Record<string, Price> = {
  "gemini-3.8-flash": { input: 0.75, output: 3.75, source: `${PRICING_SOURCE}; introductory rate through 2026-12-31` },
  "gemini-3.7-flash": { input: 0.75, output: 3.75, source: `${PRICING_SOURCE}; introductory rate through 2026-12-31` },
  "gemini-3.5-flash": { input: 1.5, output: 9, source: PRICING_SOURCE },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5, source: PRICING_SOURCE },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, source: PRICING_SOURCE },
};

/** Longest published model name that prefixes the served model version, so dated snapshots still price. */
export function priceFor(model: string | null | undefined): Price | null {
  if (!model) return null;
  const match = Object.keys(pricing).filter((name) => model.startsWith(name)).sort((a, b) => b.length - a.length)[0];
  return match ? pricing[match] : null;
}
