const required = [
  "DATABASE_URL", "MONGODB_URI", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET",
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "AUTH_ALLOWED_EMAILS", "GEMINI_API_KEY",
] as const;

const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) throw new Error(`Missing deployment environment variables: ${missing.join(", ")}`);

if (new URL(process.env.BETTER_AUTH_URL!).protocol !== "https:") {
  throw new Error("BETTER_AUTH_URL must use HTTPS in deployment");
}
if (process.env.BETTER_AUTH_SECRET!.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must have at least 32 characters");
}
new URL(process.env.DATABASE_URL!);
new URL(process.env.MONGODB_URI!);
console.log("Deployment configuration is complete");
