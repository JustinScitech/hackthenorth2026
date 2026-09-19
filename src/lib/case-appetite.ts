import { z } from "zod";
import type { Mapping } from "../federato/schema";

export const caseAppetiteSchema = z.object({
  business: z.enum(["new", "renewal"]).nullable().default(null),
  line: z.string().trim().min(1).max(80).nullable().default(null),
  premium: z.number().finite().nonnegative().nullable().default(null),
  constructionPercent: z.number().min(0).max(100).nullable().default(null),
  lossValue: z.number().finite().nonnegative().nullable().default(null),
  lossHistoryComplete: z.boolean().default(false),
  effective: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});
export type CaseAppetite = z.infer<typeof caseAppetiteSchema>;
export const caseMapping: Mapping = {
  account: "account", business: "business", line: "line", state: "state", tiv: "tiv", premium: "premium",
  year: "year", constructionPercent: "constructionPercent", lossValue: "lossValue", effective: "effective", expiration: "expiration",
};

export function brokerAppetite(text: string): Partial<CaseAppetite> {
  const result: Record<string, unknown> = {};
  const fields: Record<string, keyof CaseAppetite> = {
    "business type": "business", "line of business": "line", "premium": "premium",
    "eligible construction percent": "constructionPercent", "five-year loss value": "lossValue",
    "five-year history complete": "lossHistoryComplete", "effective date": "effective", "expiration date": "expiration",
  };
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    const key = fields[line.slice(0, separator).trim().toLowerCase()];
    if (separator < 0 || !key) continue;
    const value = line.slice(separator + 1).trim();
    const candidate = ["premium", "constructionPercent", "lossValue"].includes(key)
      ? (/^\$?\d[\d,]*(?:\.\d+)?%?$/.test(value) ? Number(value.replace(/[$,%]/g, "")) : null)
      : key === "lossHistoryComplete" ? value.toLowerCase() === "yes" : value.toLowerCase();
    const parsed = caseAppetiteSchema.shape[key].safeParse(candidate);
    result[key] = parsed.success ? parsed.data : null;
  }
  return result as Partial<CaseAppetite>;
}

export const brokerAppetiteInstructions = "Supply missing appetite fields on separate lines: Business type: new or renewal; Line of business: property; Premium: dollar amount; Eligible construction percent: 0-100; Five-year loss value: dollar amount; Five-year history complete: yes or no; Effective date: YYYY-MM-DD; Expiration date: YYYY-MM-DD. Dollar amounts must be USD. Loss counts do not establish five-year loss dollars.";
