import type { Metadata } from "next";
import { SettingsPanel } from "@/app/ui/settings";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <SettingsPanel />;
}
