import type { Metadata } from "next";
import { QuoteAssistant } from "@/app/ui/quote-assistant";

export const metadata: Metadata = { title: "Get an insurance estimate", description: "Describe what you need for tenant or car insurance and get an estimate, a recommendation, or the next step in plain language." };

export default function QuotePage() {
  return (
    <main className="shell shell-narrow quote-page">
      <h1>Get an insurance estimate</h1>
      <p className="lede">Describe what you need for tenant or car insurance. The assistant reads your message, asks only for what is missing, and explains every question and every factor in the price. An advisor confirms the final quote.</p>
      <QuoteAssistant />
      <p className="demo-note">Demo rate tables; binding stays with the insurer. Basic auto insurance in British Columbia, Saskatchewan, and Manitoba comes from the public insurer.</p>
    </main>
  );
}
