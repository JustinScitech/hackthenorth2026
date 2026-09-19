import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { AstraHome } from "./home/astra-home";

const sans = Inter({ subsets: ["latin"], variable: "--font-landing-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-landing-mono", display: "swap" });

export const metadata: Metadata = {
  title: { absolute: "Astra Risk — See the whole risk" },
  description:
    "Astra reads submissions, investigates real-world risk, evaluates carrier appetite, and explains every decision. Explore an interactive underwriting digital twin.",
};
export default function HomePage() {
  return <AstraHome fontClassName={`${sans.variable} ${mono.variable}`} />;
}
