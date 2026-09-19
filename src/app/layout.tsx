import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "./ui/theme";
import { DEFAULT_THEME, themeInitScript } from "./ui/theme-config";
import "./globals.css";

// Ledger type system: a serif for headings and labels, a grotesk for reading, a mono for figures only.
const display = Fraunces({ subsets: ["latin"], variable: "--font-display-face", display: "swap", axes: ["opsz", "SOFT"], style: ["normal", "italic"] });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans-face", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-mono-face", display: "swap", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Astra Risk", template: "%s · Astra Risk" },
  description: "Durable, human-reviewed commercial property underwriting.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">{themeInitScript}</Script>
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
