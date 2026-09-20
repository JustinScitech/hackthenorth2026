import { requireApiSession } from "@/lib/auth-access";
import { MAX_PDF_BYTES, parseInsuranceText, readInsurancePdf, scoreInsurancePdf } from "@/lib/insurance-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "Use the upload form on this site." }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_PDF_BYTES || (file.type && file.type !== "application/pdf")) {
      return Response.json({ error: "Choose a PDF file no larger than 4 MB." }, { status: 400 });
    }
    const text = await readInsurancePdf(file);
    const fields = parseInsuranceText(text);
    return Response.json({ filename: file.name.slice(0, 200), text, fields, score: scoreInsurancePdf(fields, file.name.slice(0, 200)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not read the PDF." }, { status: 400 });
  }
}
