import "server-only";
import { auth } from "@/auth";
import { isAllowedEmail } from "./auth-policy";

export async function getAuthorizedSession(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  return session && isAllowedEmail(session.user.email) ? session : null;
}

export async function requireApiSession(request: Request): Promise<Response | null> {
  if (await getAuthorizedSession(request.headers)) return null;
  return Response.json({ error: "Sign in to access this workspace." }, { status: 401, headers: { "Cache-Control": "no-store" } });
}
