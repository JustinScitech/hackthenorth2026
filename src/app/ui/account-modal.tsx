"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { SignOut, X } from "@phosphor-icons/react/dist/ssr";
import { authClient } from "@/lib/auth-client";
import { SettingsSections } from "./settings";

export type AccountUser = { name: string; email: string };

export function avatarInitial(user: AccountUser): string {
  return (user.name || user.email).slice(0, 1).toUpperCase();
}

/**
 * Account and settings dialog opened from the profile avatar. A native <dialog> supplies the
 * focus trap, Escape handling, and backdrop; React only decides when it is open. Contents mount
 * only while open so the Settings page and this dialog never both expose a "Theme" group at once.
 */
export function AccountModal({ user, open, onClose }: { user: AccountUser; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  async function signOut() {
    setSigningOut(true); setSignOutError(false);
    try {
      const result = await authClient.signOut();
      if (result.error) { setSignOutError(true); return; }
      window.location.assign("/sign-in");
    } catch {
      setSignOutError(true);
    } finally {
      setSigningOut(false);
    }
  }

  // With zero padding on the dialog, a click whose target is the dialog itself landed on the backdrop.
  function onBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === ref.current) onClose();
  }

  return (
    <dialog ref={ref} className="account-dialog" aria-labelledby="account-dialog-title" onClose={onClose} onClick={onBackdropClick}>
      {open && (
        <div className="account-dialog-inner">
          <header className="account-header">
            <span className="avatar avatar-lg" aria-hidden="true">{avatarInitial(user)}</span>
            <span className="account-identity"><strong id="account-dialog-title">{user.name || user.email}</strong><small>{user.email}</small></span>
            <button className="icon-button" type="button" onClick={onClose} aria-label="Close" title="Close"><X size={16} /></button>
          </header>
          <div className="account-body"><SettingsSections /></div>
          <footer className="account-footer">
            {signOutError ? <p className="sidebar-auth-error" role="alert">Could not sign out. Try again.</p> : <span />}
            <button className="secondary-button" type="button" onClick={() => void signOut()} disabled={signingOut}><SignOut size={16} />Sign out</button>
          </footer>
        </div>
      )}
    </dialog>
  );
}
