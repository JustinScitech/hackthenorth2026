import type { Metadata } from "next";
import { Queue } from "@/app/ui/queue";

export const metadata: Metadata = { title: "Queue" };

export default function TriagePage() {
  return <Queue />;
}
