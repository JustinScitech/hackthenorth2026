import assert from "node:assert/strict";
import test from "node:test";
import PDFDocument from "pdfkit";
import { parseInsuranceText, readInsurancePdf, scoreInsurancePdf } from "./insurance-pdf";

function makePdf(lines: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument();
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));
    for (const line of lines) document.text(line);
    document.end();
  });
}

test("uploaded PDF text feeds case fields and a separate triage score", async () => {
  const pdf = await makePdf([
    "Named insured: Northline Fabrication", "State: CO", "Total insured value: $6,250,000",
    "Year built: 2008", "Business type: new", "Line of business: property",
    "Total premium: $90,000", "Eligible construction percent: 75%",
    "Five-year loss value: $20,000", "Five-year history complete: yes", "Effective date: 2026-10-01", "Expiration date: 2027-10-01",
  ]);
  const text = await readInsurancePdf(new File([Uint8Array.from(pdf)], "northline.pdf", { type: "application/pdf" }));
  const fields = parseInsuranceText(text);
  assert.equal(fields.insuredName, "Northline Fabrication");
  assert.equal(fields.tiv, 6_250_000);
  assert.equal(fields.appetite.lossValue, 20_000);
  const score = scoreInsurancePdf(fields, "northline.pdf");
  assert.equal(score.account, "Northline Fabrication");
  assert.ok(score.criteria.some((criterion) => criterion.concept === "state" && criterion.status === "target"));
  assert.ok(score.criteria.every((criterion) => criterion.source.includes("PDF")));
});

test("unlabeled figures never become appetite evidence", () => {
  const fields = parseInsuranceText("The warehouse is worth $9 million and had two claims.\nState: CA");
  assert.equal(fields.tiv, null);
  assert.equal(fields.losses, null);
  const score = scoreInsurancePdf(fields, "notes.pdf");
  assert.equal(score.criteria.find((criterion) => criterion.concept === "tiv")?.status, "unknown");
});

test("invalid and textless PDFs give clear errors", async () => {
  await assert.rejects(readInsurancePdf(new File(["not a pdf"], "bad.pdf", { type: "application/pdf" })), /valid PDF/);
  const blank = await makePdf([]);
  await assert.rejects(readInsurancePdf(new File([Uint8Array.from(blank)], "blank.pdf", { type: "application/pdf" })), /no selectable text/);
});
