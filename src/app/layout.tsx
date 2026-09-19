import type { Metadata } from "next";
import { AppFrame } from "./ui/sidebar";
import { ThemeProvider } from "./ui/theme";
import { DEFAULT_THEME, themeInitScript } from "./ui/theme-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Underwriting Review",
  description: "Durable underwriting case review",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint; a client-only React re-mount of this script (dev hot reload) logs a harmless warning. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <AppFrame>{children}</AppFrame>
        </ThemeProvider>
      </body>
    </html>
  );
}
