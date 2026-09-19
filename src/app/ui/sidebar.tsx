"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronDown, Inbox, ListOrdered, Menu, Moon, Settings, ShieldCheck, Sun, X } from "lucide-react";
import { useTheme } from "./theme";

const navigation = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Submission queue", icon: Inbox, match: (path: string) => path === "/" || path.startsWith("/cases") },
      { href: "/triage", label: "Federato triage", icon: ListOrdered, match: (path: string) => path.startsWith("/triage") },
    ],
  },
  {
    label: "Reference",
    items: [
      { href: "https://github.com/JustinScitech/hackthenorth2026#readme", label: "Project guide", icon: BookOpen, match: () => false, external: true },
    ],
  },
];

function Brand() {
  return <Link className="brand" href="/"><span className="brand-mark"><ShieldCheck size={16} strokeWidth={2.2} /></span><span>Underwriting Review</span></Link>;
}

function ThemeControl() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="segmented" role="group" aria-label="Appearance">
      <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}><Moon size={14} />Dark</button>
      <button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")}><Sun size={14} />Light</button>
    </div>
  );
}

function SettingsPanel() {
  const [open, setOpen] = useState(false);
  return (
    <nav className="nav-group" aria-label="Preferences">
      <p className="nav-label">Preferences</p>
      <button className="nav-link nav-button" type="button" aria-expanded={open} aria-controls="settings-panel" onClick={() => setOpen((value) => !value)}>
        <Settings size={16} strokeWidth={2} />Settings<ChevronDown className="chevron" size={14} />
      </button>
      {open && (
        <div className="settings-panel" id="settings-panel">
          <div className="settings-row"><span>Appearance</span><ThemeControl /></div>
          <p className="settings-hint">Your choice is saved in this browser.</p>
        </div>
      )}
    </nav>
  );
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

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="app-frame" data-nav-open={open ? "true" : "false"}>
      <aside className="sidebar" id="app-sidebar" aria-label="Primary">
        <Brand />
        {navigation.map((group) => (
          <nav className="nav-group" key={group.label} aria-label={group.label}>
            <p className="nav-label">{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = item.match(pathname);
              const external = "external" in item && item.external;
              return (
                <Link
                  className="nav-link" key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                  target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}
                >
                  <Icon size={16} strokeWidth={2} />{item.label}
                </Link>
              );
            })}
          </nav>
        ))}
        <SettingsPanel />
        <div className="sidebar-footer">Demo guidelines only. Every decision requires underwriter review.</div>
      </aside>
      <button className="sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setOpen(false)} tabIndex={-1} />
      <div className="content">
        <header className="topbar">
          <Brand />
          <div className="topbar-actions">
            <ThemeQuickToggle />
            <button className="icon-button" type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="app-sidebar" onClick={() => setOpen((value) => !value)}>
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
