import assert from "node:assert/strict";
import { test } from "node:test";
import { temporalConfig } from "./temporal-config";

test("local Temporal uses the default namespace without TLS", () => {
  assert.deepEqual(temporalConfig({}), {
    namespace: "default",
    connectionOptions: { address: "localhost:7233" },
  });
});

test("a self-hosted Temporal namespace can be configured without an API key", () => {
  assert.deepEqual(temporalConfig({ TEMPORAL_ADDRESS: "temporal.internal:7233", TEMPORAL_NAMESPACE: "demo" }), {
    namespace: "demo",
    connectionOptions: { address: "temporal.internal:7233" },
  });
});

test("Temporal Cloud enables TLS and API-key authentication", () => {
  assert.deepEqual(temporalConfig({
    TEMPORAL_ADDRESS: "demo.account.tmprl.cloud:7233",
    TEMPORAL_NAMESPACE: "demo.account",
    TEMPORAL_API_KEY: "test-key",
  }), {
    namespace: "demo.account",
    connectionOptions: { address: "demo.account.tmprl.cloud:7233", tls: true, apiKey: "test-key" },
  });
});

test("partial Cloud configuration fails before connecting", () => {
  assert.throws(() => temporalConfig({ TEMPORAL_API_KEY: "test-key" }), /TEMPORAL_ADDRESS and TEMPORAL_NAMESPACE/);
  assert.throws(() => temporalConfig({ TEMPORAL_ADDRESS: "demo.account.tmprl.cloud:7233" }), /TEMPORAL_API_KEY/);
});
