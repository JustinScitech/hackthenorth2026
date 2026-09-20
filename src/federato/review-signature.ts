import { createHmac, timingSafeEqual } from "node:crypto";
import type { RankedSubmission } from "./scoring";

function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("Review signing is unavailable. Configure BETTER_AUTH_SECRET.");
  return value;
}

function digest(resource: string, generatedAt: string, item: RankedSubmission) {
  return createHmac("sha256", secret()).update(JSON.stringify({ resource, generatedAt, item })).digest("hex");
}

export function signReviewItem(resource: string, generatedAt: string, item: RankedSubmission) {
  return digest(resource, generatedAt, item);
}

export function verifyReviewItem(resource: string, generatedAt: string, item: RankedSubmission, signature: string) {
  const age = Date.now() - Date.parse(generatedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 24 * 60 * 60 * 1000 || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = Buffer.from(digest(resource, generatedAt, item), "hex");
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
