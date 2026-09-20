"use client";

import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

type NavSection = { group: string; items: string[][] };

export function DocsSidebar({ sections }: { sections: NavSection[] }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("#introduction");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const syncHash = () => setActive(window.location.hash || "#introduction");
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || !(target instanceof HTMLElement) || target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("keydown", focusSearch);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("keydown", focusSearch);
    };
  }, []);

  const term = query.trim().toLowerCase();
  const filtered = sections.map((section) => ({
    ...section,
    items: section.group.toLowerCase().includes(term) ? section.items : section.items.filter(([, label]) => label.toLowerCase().includes(term)),
  })).filter((section) => section.items.length > 0);

  return (
    <nav className="docs-nav" aria-label="Documentation sections">
      <label className="docs-search">
        <MagnifyingGlass size={16} aria-hidden="true" />
        <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setQuery(""); event.currentTarget.blur(); } }} placeholder="Search sections..." aria-label="Search documentation sections" />
        <kbd>/</kbd>
      </label>
      <div className="docs-nav-groups">
        {filtered.map((section) => (
          <div className="docs-nav-group" key={section.group}>
            <p className="docs-nav-heading">{section.group}</p>
            {section.items.map(([href, label]) => (
              <a key={href} href={href} aria-current={active === href ? "location" : undefined} onClick={() => setActive(href)}>{label}</a>
            ))}
          </div>
        ))}
        {filtered.length === 0 && <p className="docs-search-empty">No matching sections</p>}
      </div>
    </nav>
  );
}
