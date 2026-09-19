import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "./ui/theme";
import { DEFAULT_THEME, themeInitScript } from "./ui/theme-config";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-landing-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-landing-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Astra Risk", template: "%s · Astra Risk" },
  description: "Durable, human-reviewed commercial property underwriting.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">{themeInitScript}</Script>
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
