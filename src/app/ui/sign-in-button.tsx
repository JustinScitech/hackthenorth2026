"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function SignInButton({ disabled }: { disabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function signIn() {
    setPending(true); setError(false);
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: "/overview", errorCallbackURL: "/sign-in?error=access" });
      if (result.error) setError(true);
      setPending(false);
    } catch {
      setError(true); setPending(false);
    }
  }

  return <>
    <button className="primary-button auth-button" type="button" onClick={() => void signIn()} disabled={disabled || pending}><LogIn size={17} />{pending ? "Opening Google..." : "Continue with Google"}</button>
    {error && <p className="auth-error" role="alert">Could not start Google sign-in. Please try again.</p>}
  </>;
}
