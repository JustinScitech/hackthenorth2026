import assert from "node:assert/strict";
import test from "node:test";
import { publicSourceUrl } from "./public-source-url";

test("accepts a public HTTPS source", () => {
  assert.equal(publicSourceUrl("https://example.com/property").hostname, "example.com");
});

test("rejects private, credentialed, and non-HTTPS sources", () => {
  for (const value of ["http://example.com", "https://localhost/", "https://localhost./", "https://127.0.0.1/", "https://user:pass@example.com/", "https://service.internal/"]) {
    assert.throws(() => publicSourceUrl(value));
  }
});
