export function isAllowedEmail(email: string | null | undefined, allowed = process.env.AUTH_ALLOWED_EMAILS): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return Boolean(normalized) && (allowed ?? "").split(",").some((entry) => entry.trim().toLowerCase() === normalized);
}
