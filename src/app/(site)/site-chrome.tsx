"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { Wordmark } from "../ui/logo";

export function SiteHeader() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Wordmark href="/" />
        <nav className="site-nav" aria-label="Site">
          <Link href="/#experience">Platform</Link>
          <Link href="/#underwriting">How it works</Link>
          <Link href="/quote" aria-current={pathname.startsWith("/quote") ? "page" : undefined}>Get an estimate</Link>
          <Link href="/docs" aria-current={pathname.startsWith("/docs") ? "page" : undefined}>Documentation</Link>
        </nav>
        <div className="site-actions">
          <Link className="primary-button" href="/overview">Open workspace<ArrowUpRight size={14} /></Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>Astra Risk · Durable, human-reviewed underwriting. Demo guidelines only; nothing here binds coverage.</span>
        <nav aria-label="Footer"><Link href="/quote">Get an estimate</Link><Link href="/docs">Docs</Link><Link href="/docs#api">API reference</Link><Link href="/overview">Workspace</Link><Link href="/settings">Settings</Link></nav>
      </div>
    </footer>
  );
}
