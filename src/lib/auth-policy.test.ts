import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedEmail } from "./auth-policy";

test("email access is denied without an explicit allowlist", () => {
  assert.equal(isAllowedEmail("person@example.com", ""), false);
  assert.equal(isAllowedEmail(null, "person@example.com"), false);
});

test("allowlist matching is exact and case-insensitive", () => {
  assert.equal(isAllowedEmail(" ALICE@EXAMPLE.COM ", " bob@example.com, alice@example.com "), true);
  assert.equal(isAllowedEmail("alice@example.com.attacker.test", "alice@example.com"), false);
  assert.equal(isAllowedEmail("other@example.com", "alice@example.com"), false);
});
