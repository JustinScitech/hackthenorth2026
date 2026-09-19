/**
 * Reports which redirect URIs Google has registered for an OAuth client, without a
 * browser or a running server. Google's authorization endpoint returns
 * redirect_uri_mismatch for unregistered URIs and a sign-in page for registered ones.
 *
 *   npm run auth:check                      # client from .env, local + production candidates
 *   npm run auth:check -- --client <id>     # any client id
 *   npm run auth:check -- --origin https://example.com
 */
const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const clientId = flag("--client") ?? process.env.GOOGLE_CLIENT_ID;
if (!clientId) { console.error("Set GOOGLE_CLIENT_ID in .env or pass --client <id>."); process.exit(1); }

const origins = [process.env.BETTER_AUTH_URL ?? "http://localhost:3003", flag("--origin") ?? "https://astra-risk.vercel.app"].map((o) => o.replace(/\/+$/, ""));
const candidates = origins.flatMap((origin) => [
  `${origin}/api/auth/callback/google`,
  `${origin}/api/auth/callback/google/`,
  `${origin}/`,
  origin,
]);

async function registered(redirectUri: string): Promise<"registered" | "not registered" | "unknown"> {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: clientId!, redirect_uri: redirectUri, response_type: "code", scope: "openid" }).toString();
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
  const body = await response.text();
  if (body.includes("redirect_uri_mismatch")) return "not registered";
  if (body.includes("invalid_client")) throw new Error(`Google does not recognise client ${clientId}.`);
  return response.ok ? "registered" : "unknown";
}

async function main() {
  console.log(`Client: ${clientId}\n`);
  for (const uri of candidates) {
    const result = await registered(uri);
    console.log(`${result === "registered" ? "✔" : result === "not registered" ? "✘" : "?"} ${uri}`);
  }
  console.log("\nThe app needs the two ending in /api/auth/callback/google (no trailing slash) marked ✔.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
