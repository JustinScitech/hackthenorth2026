import { temporalConfig } from "../src/agent/temporal-config";

const required = [
  "DATABASE_URL", "MONGODB_URI", "TEMPORAL_ADDRESS", "TEMPORAL_NAMESPACE", "TEMPORAL_API_KEY", "GEMINI_API_KEY",
] as const;

const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) throw new Error(`Missing Render worker environment variables: ${missing.join(", ")}`);

for (const key of ["DATABASE_URL", "MONGODB_URI"] as const) {
  const url = new URL(process.env[key]!);
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(`${key} must point to hosted storage for the Render worker`);
  }
}

const { connectionOptions } = temporalConfig();
if (connectionOptions.address.startsWith("localhost:") || connectionOptions.address.startsWith("127.0.0.1:")) {
  throw new Error("TEMPORAL_ADDRESS must point to a hosted Temporal service for the Render worker");
}

console.log("Render worker configuration is complete");
