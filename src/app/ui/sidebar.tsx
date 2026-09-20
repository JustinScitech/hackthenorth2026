"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Briefcase, Gear, List, ListNumbers, Moon, Plus, Receipt, SquaresFour, Sun, Tray, X } from "@phosphor-icons/react/dist/ssr";
import { useTheme } from "./theme";
import { Mark, Wordmark } from "./logo";
import { AccountModal, avatarInitial } from "./account-modal";

function Brand() {
  return <Wordmark href="/overview" />;
}

function ThemeQuickToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button className="icon-button" type="button" aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`} onClick={() => setTheme(next)}>
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

function NavLink({ href, active, children, external = false }: { href: string; active: boolean; children: ReactNode; external?: boolean }) {
  return (
    <Link className="nav-link" href={href} aria-current={active ? "page" : undefined} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
      {children}
    </Link>
  );
}

export function AppFrame({ children, user }: { children: ReactNode; user: { name: string; email: string } }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => { setOpen(false); setAccountOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isNewCase = pathname === "/cases/new";
  const isCases = pathname.startsWith("/cases") && !isNewCase;

  const accountButton = { "aria-haspopup": "dialog" as const, "aria-expanded": accountOpen, onClick: () => setAccountOpen(true), title: "Account and settings" };

  return (
    <div className="app-frame" data-nav-open={open ? "true" : "false"}>
      <aside className="sidebar" id="app-sidebar" aria-label="Primary">
        <Brand />
        <div className="workspace"><Briefcase size={18} /><span>Commercial property<small>Demo workspace</small></span></div>
        <nav className="nav-group" aria-label="Workspace">
          <NavLink href="/overview" active={pathname === "/overview"}><SquaresFour size={17} />Overview</NavLink>
          <div className="nav-row">
            <NavLink href="/cases" active={isCases}><Tray size={17} />Cases</NavLink>
            <Link className="nav-add" href="/cases/new" aria-label="Create case" title="Create case"><Plus size={15} /></Link>
          </div>
          <div className="nav-sub">
            <NavLink href="/cases/new" active={isNewCase}><Plus size={14} />Create case</NavLink>
          </div>
          <NavLink href="/quotes" active={pathname.startsWith("/quotes")}><Receipt size={17} />Quotes</NavLink>
          <NavLink href="/triage" active={pathname.startsWith("/triage")}><ListNumbers size={17} />Federato triage<span className="nav-badge">live</span></NavLink>
        </nav>
        <div className="sidebar-bottom">
          <NavLink href="/docs" active={false}><BookOpen size={17} />Docs and API reference</NavLink>
          <NavLink href="/" active={false}><Mark size={17} />Home</NavLink>
          <button className="sidebar-user" type="button" aria-label="Account and settings" {...accountButton}>
            <span className="avatar" aria-hidden="true">{avatarInitial(user)}</span>
            <span className="sidebar-user-details"><strong>{user.name || user.email}</strong><small>{user.email}</small></span>
            <Gear className="gear" size={16} />
          </button>
        </div>
      </aside>
      <button className="sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setOpen(false)} tabIndex={-1} />
      <div className="content">
        <header className="topbar">
          <Brand />
          <div className="topbar-actions">
            <button className="icon-button avatar-button" type="button" aria-label="Account and settings" {...accountButton}>{avatarInitial(user)}</button>
            <ThemeQuickToggle />
            <button className="icon-button" type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="app-sidebar" onClick={() => setOpen((value) => !value)}>
              {open ? <X size={18} /> : <List size={18} />}
            </button>
          </div>
        </header>
        {children}
      </div>
      <AccountModal user={user} open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  );
}
