import assert from "node:assert/strict";
import test from "node:test";
import { browsePublicSource } from "./public-source";
import { publicSourceUrl } from "./public-source-url";

test("accepts a public HTTPS source", () => {
  assert.equal(publicSourceUrl("https://example.com/property").hostname, "example.com");
});

test("rejects private, credentialed, and non-HTTPS sources", () => {
  for (const value of ["http://example.com", "https://localhost/", "https://localhost./", "https://127.0.0.1/", "https://user:pass@example.com/", "https://service.internal/"]) {
    assert.throws(() => publicSourceUrl(value));
  }
});

test("browsePublicSource reads the captured page without a live browser and keeps the parser as the floor", async () => {
  const key = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const text = "Property Record Card. Year Built: 1965. Construction: Masonry. Sprinklered: Yes. FEMA Flood Zone: AE.";
    const evidence = await browsePublicSource("https://assessor.example.gov/parcel/1", async (value) => ({ url: value, title: "Property Record Card", text }));
    assert.equal(evidence.url, "https://assessor.example.gov/parcel/1");
    assert.equal(evidence.excerpt, text);
    assert.deepEqual(evidence.signals?.map((signal) => signal.kind), ["yearBuilt", "constructionType", "sprinklered", "floodZone"]);
    assert.deepEqual(evidence.conflicts, []);
    assert.equal(evidence.extraction?.status, "not_configured");
  } finally {
    if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key;
  }
});
