"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { Wordmark } from "../ui/logo";
import { useTheme } from "../ui/theme";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return <button className="icon-button" type="button" aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`} onClick={() => setTheme(next)}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>;
}

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Wordmark href="/" />
        <nav className="site-nav" aria-label="Site">
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/docs" aria-current={pathname.startsWith("/docs") ? "page" : undefined}>Docs</Link>
          <ThemeToggle />
          <Link className="primary-button" href="/overview">Open workspace</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>Astra Risk · Durable, human-reviewed underwriting. Demo guidelines only; nothing here binds coverage.</span>
        <nav aria-label="Footer"><Link href="/docs">Docs</Link><Link href="/docs#api">API reference</Link><Link href="/overview">Workspace</Link><Link href="/settings">Settings</Link></nav>
      </div>
    </footer>
  );
}
