import { isIP } from "node:net";

export function publicSourceUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:" || url.username || url.password || !host.includes(".") || isIP(host)
    || [".local", ".localhost", ".internal", ".onion"].some((suffix) => host.endsWith(suffix))) {
    throw new Error("Provide a public HTTPS source URL.");
  }
  return url;
}
