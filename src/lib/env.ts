/**
 * Resolves backing-service targets from where the app is running.
 *
 * Locally, DATABASE_URL and MONGODB_URI point at the Docker or Homebrew services.
 * On Vercel there is no localhost, so the resolver prefers the hosted targets
 * (TIGERDATA_DATABASE_URL, MONGODB_ATLAS_URI) and refuses a localhost value with a
 * clear error instead of letting the driver dial 127.0.0.1 and fail with ECONNREFUSED.
 */
type Target = { url: string; source: string };
type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export function isDeployed(env: Env = process.env): boolean {
  return Boolean(env.VERCEL || env.VERCEL_ENV);
}

export function isLocalUrl(url: string): boolean {
  try {
    // mongodb+srv and postgres URLs both parse with the WHATWG parser for host purposes.
    const host = new URL(url).hostname.toLowerCase();
    return LOCAL_HOSTS.has(host);
  } catch {
    return /(^|@|\/\/)(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);
  }
}

/**
 * Node's pg driver treats sslmode=require as verify-full and rejects Tiger Data's
 * certificate chain. uselibpqcompat=true restores libpq semantics for hosted URLs.
 */
export function withPgCompat(url: string): string {
  if (isLocalUrl(url) || !/sslmode=(require|prefer|verify-ca)/.test(url) || /uselibpqcompat=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}uselibpqcompat=true`;
}

function resolve(kind: string, primaryName: string, hostedName: string, env: Env, transform: (url: string) => string = (url) => url): Target {
  const primary = env[primaryName]?.trim() || undefined;
  const hosted = env[hostedName]?.trim() || undefined;
  if (!isDeployed(env)) {
    if (primary) return { url: primary, source: primaryName };
    if (hosted) return { url: transform(hosted), source: hostedName };
    throw new Error(`${primaryName} is required. Copy .env.example to .env and point it at your local ${kind}.`);
  }
  if (primary && !isLocalUrl(primary)) return { url: transform(primary), source: primaryName };
  if (hosted && !isLocalUrl(hosted)) return { url: transform(hosted), source: hostedName };
  const why = primary ? `${primaryName} points at localhost, which does not exist on Vercel` : `${primaryName} is not set`;
  throw new Error(`${why}. Set ${primaryName} (or ${hostedName}) to a hosted ${kind} in the Vercel project environment, then redeploy.`);
}

const logged = new Set<string>();
function announce(kind: string, target: Target) {
  if (logged.has(kind)) return;
  logged.add(kind);
  let host = "unparseable host";
  try { host = new URL(target.url).hostname; } catch { /* keep placeholder; never log credentials */ }
  console.info(`[env] ${kind}: ${host} via ${target.source} (${isDeployed() ? "deployed" : "local"})`);
}

export function databaseUrl(env: Env = process.env): string {
  const target = resolve("PostgreSQL", "DATABASE_URL", "TIGERDATA_DATABASE_URL", env, withPgCompat);
  if (env === process.env) announce("postgres", target);
  return target.url;
}

export function mongoUri(env: Env = process.env): string {
  const target = resolve("MongoDB", "MONGODB_URI", "MONGODB_ATLAS_URI", env);
  if (env === process.env) announce("mongodb", target);
  return target.url;
}
