import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Underwriting Review",
  description: "Durable underwriting case review",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="app-header">
          <div className="header-inner">
            <Link className="brand" href="/"><ShieldCheck size={21} strokeWidth={2.1} /><span>Underwriting Review</span></Link>
            <Link className="back-link" style={{ marginBottom: 0 }} href="/triage">Federato triage →</Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
