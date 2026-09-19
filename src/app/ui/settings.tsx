"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme";

export function SettingsPanel() {
  const { theme, setTheme } = useTheme();
  return (
    <main className="shell shell-narrow">
      <p className="breadcrumb"><Link href="/overview">Commercial property</Link><span className="sep">/</span><span className="current">Settings</span></p>
      <div className="page-title-row"><h1 className="page-title">Settings</h1></div>
      <div className="settings-stack">
        <section className="card" aria-labelledby="appearance-title">
          <div className="card-header"><h2 id="appearance-title">Appearance</h2></div>
          <div className="setting-row">
            <div><strong>Theme</strong><p>Light is the default. Your choice is saved in this browser only.</p></div>
            <div className="segmented" role="group" aria-label="Theme">
              <button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")}><Sun size={14} />Light</button>
              <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}><Moon size={14} />Dark</button>
            </div>
          </div>
        </section>
        <section className="card" aria-labelledby="workspace-title">
          <div className="card-header"><h2 id="workspace-title">Workspace</h2></div>
          <div className="setting-row"><div><strong>Guideline rules</strong><p>Cases and Federato triage share the supplied 2025 commercial property appetite.</p></div><span className="value">2025 carrier appetite</span></div>
          <div className="setting-row"><div><strong>Live updates</strong><p>Case pages poll for changes so a resumed workflow shows up without a reload.</p></div><span className="value">every 3–5 s</span></div>
          <div className="setting-row"><div><strong>Integrations</strong><p>Optional model, research, monitoring, and voice providers are configured in the server environment file, not here.</p></div><span className="value">.env</span></div>
        </section>
      </div>
    </main>
  );
}
