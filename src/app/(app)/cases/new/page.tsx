import { IntakeForm } from "@/app/ui/intake";

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ sample?: string }> }) {
  const { sample } = await searchParams;
  return <IntakeForm prefillSample={sample === "1"} />;
}
