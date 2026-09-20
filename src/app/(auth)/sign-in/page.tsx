import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Wordmark } from "@/app/ui/logo";
import { getAuthorizedSession } from "@/lib/auth-access";
import { SignInButton } from "@/app/ui/sign-in-button";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getAuthorizedSession(await headers())) redirect("/overview");
  const { error } = await searchParams;
  const configured = Boolean(process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_URL && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.AUTH_ALLOWED_EMAILS?.trim());
  return <main className="auth-shell">
    <div className="auth-content">
      <Wordmark href="/" size={32} />
      <div className="auth-panel">
        <h1>Sign in</h1>
        <p>Use an approved Google account to open the underwriting workspace.</p>
        {error && <div className="alert" role="alert">Sign-in could not be completed. Check your account access and try again.</div>}
        {!configured && <div className="alert" role="alert">Google sign-in still needs to be set up.</div>}
        <SignInButton disabled={!configured} />
      </div>
    </div>
  </main>;
}
