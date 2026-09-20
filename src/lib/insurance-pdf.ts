import { caseMapping, type CaseAppetite } from "./case-appetite";
import { scoreSubmission } from "../federato/scoring";

export const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MAX_PAGES = 30;
const MAX_TEXT = 40_000;

export type InsuranceFields = {
  insuredName: string; state: string; tiv: number | null; yearBuilt: number | null;
  losses: number | null; address: string; appetite: CaseAppetite;
};

export async function readInsurancePdf(file: File): Promise<string> {
  if (file.size > MAX_PDF_BYTES) throw new Error("PDF must be 4 MB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("Choose a valid PDF file.");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes, useSystemFonts: false });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PAGES) throw new Error("PDF must have 30 pages or fewer.");
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let pageText = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        pageText += item.str + (item.hasEOL ? "\n" : " ");
      }
      pages.push(pageText.trim());
    }
    const text = pages.join("\n\n").trim();
    if (!text) throw new Error("This PDF has no selectable text. Upload a text-based PDF or paste the submission details.");
    if (text.length > MAX_TEXT) throw new Error("PDF contains more than 40,000 characters. Use a shorter submission PDF.");
    return text;
  } finally {
    await task.destroy();
  }
}

function amount(value: string): number | null {
  const match = value.match(/^\s*\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:USD)?\s*$/i);
  return match ? Number(match[1].replaceAll(",", "")) : null;
}

function date(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}` : null;
}

/** Only labeled values become scoring facts. Ambiguous prose remains available for case review. */
export function parseInsuranceText(text: string): InsuranceFields {
  const found = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:]{2,55}):\s*(.*?)\s*$/);
    if (match && match[2]) found.set(match[1].trim().toLowerCase().replace(/\s+/g, " "), match[2].trim());
  }
  const get = (...labels: string[]) => labels.map((label) => found.get(label)).find(Boolean) ?? "";
  const integer = (value: string) => /^\d+$/.test(value) ? Number(value) : null;
  const state = get("state", "risk state", "primary risk state", "property state").toUpperCase();
  const business = get("business type", "submission type").toLowerCase();
  const line = get("line of business").toLowerCase();
  const percent = get("eligible construction percent", "construction percent").replace(/%$/, "").trim();
  const complete = get("five-year history complete", "five year history complete").toLowerCase();
  return {
    insuredName: get("named insured", "insured name", "account name", "insured"),
    state: /^[A-Z]{2}$/.test(state) ? state : "",
    tiv: amount(get("total insured value", "total insurable value", "tiv")),
    yearBuilt: integer(get("oldest building year", "year built", "construction year")),
    losses: integer(get("historical loss count", "three-year loss count", "loss count")),
    address: get("property address", "risk address", "location address"),
    appetite: {
      business: business === "new" || business === "new business" ? "new" : business === "renewal" || business === "renewal business" ? "renewal" : null,
      line: line || null,
      premium: amount(get("total premium", "premium")),
      constructionPercent: /^\d+(?:\.\d+)?$/.test(percent) && Number(percent) <= 100 ? Number(percent) : null,
      lossValue: amount(get("five-year loss value", "five year loss value", "five-year loss dollars")),
      lossHistoryComplete: complete === "yes" || complete === "true",
      effective: date(get("effective date", "policy effective date")),
      expiration: date(get("expiration date", "policy expiration date")),
    },
  };
}

export function scoreInsurancePdf(fields: InsuranceFields, filename: string) {
  const row = {
    id: filename, account: fields.insuredName || null, business: fields.appetite.business,
    line: fields.appetite.line, state: fields.state || null, tiv: fields.tiv,
    premium: fields.appetite.premium, year: fields.yearBuilt,
    constructionPercent: fields.appetite.constructionPercent,
    lossValue: fields.appetite.lossHistoryComplete ? fields.appetite.lossValue : null,
    effective: fields.appetite.effective, expiration: fields.appetite.expiration,
  };
  const result = scoreSubmission(row, caseMapping);
  return { ...result, criteria: result.criteria.map((criterion) => ({ ...criterion, source: criterion.status === "unknown" ? "Missing or incomplete in uploaded PDF" : `Uploaded PDF: ${filename}` })), evidenceNote: "Only clearly labeled PDF values were scored. Five-year loss dollars require an explicit complete-history statement. Confirm all extracted values before making a decision." };
}

export type ParsedInsurancePdf = { filename: string; text: string; fields: InsuranceFields; score: ReturnType<typeof scoreInsurancePdf> };
