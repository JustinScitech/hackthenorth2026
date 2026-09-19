import type { Metadata } from "next";
import { Overview } from "@/app/ui/overview";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return <Overview />;
}
