"use client";

import { useId } from "react";
import Link from "next/link";
import { Moon, Sun } from "@phosphor-icons/react/dist/ssr";
import { useTheme } from "./theme";

/** The Appearance and Workspace cards, shared by the Settings page and the account dialog. */
export function SettingsSections() {
  const { theme, setTheme } = useTheme();
  const id = useId();
  return (
    <>
      <section className="card" aria-labelledby={`${id}-appearance`}>
        <div className="card-header"><h2 id={`${id}-appearance`}>Appearance</h2></div>
        <div className="setting-row">
          <div><strong>Theme</strong><p>Light is the default. Your choice is saved in this browser only.</p></div>
          <div className="segmented" role="group" aria-label="Theme">
            <button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")}><Sun size={14} />Light</button>
            <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}><Moon size={14} />Dark</button>
          </div>
        </div>
      </section>
      <section className="card" aria-labelledby={`${id}-workspace`}>
        <div className="card-header"><h2 id={`${id}-workspace`}>Workspace</h2></div>
        <div className="setting-row"><div><strong>Guideline rules</strong><p>Cases and Federato triage share the supplied 2025 commercial property appetite.</p></div><span className="value">2025 carrier appetite</span></div>
        <div className="setting-row"><div><strong>Live updates</strong><p>Case pages poll for changes so a resumed workflow shows up without a reload.</p></div><span className="value">every 3–5 s</span></div>
        <div className="setting-row"><div><strong>Integrations</strong><p>Optional model, research, monitoring, and voice providers are set in the server environment file.</p></div><span className="value">.env</span></div>
      </section>
    </>
  );
}

/** Full-page Settings, kept so /settings deep links and the site footer still work. */
export function SettingsPanel() {
  return (
    <main className="shell shell-narrow">
      <p className="breadcrumb"><Link href="/overview">Commercial property</Link><span className="sep">/</span><span className="current">Settings</span></p>
      <div className="page-title-row"><h1 className="page-title">Settings</h1></div>
      <div className="settings-stack"><SettingsSections /></div>
    </main>
  );
}
