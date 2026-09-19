import { CaseDetail } from "../../ui/case-detail";
import { listCases } from "@/lib/db";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, history] = await Promise.all([params, listCases().catch(() => [])]);
  return <CaseDetail id={id} history={history} />;
}
