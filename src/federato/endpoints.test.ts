import assert from "node:assert/strict";
import test from "node:test";
import { FederatoClient, defaultEndpoints, validateEndpoints } from "./client";

test("endpoint defaults survive absent and blank environment values", () => {
  assert.deepEqual(validateEndpoints({ authUrl: undefined, audience: "  " }), defaultEndpoints);
});

test("unsafe endpoint overrides are rejected without echoing their values", () => {
  for (const authUrl of ["http://auth.product.federato.ai/oauth/token", "https://attacker.example/token", "https://auth.product.federato.ai.attacker.example", "https://user:private@auth.product.federato.ai/token", "https://auth.product.federato.ai/token#private", "private"]) {
    assert.throws(() => validateEndpoints({ authUrl }), (error: Error) => error.message.includes("FEDERATO_AUTH_URL") && !error.message.includes("private"));
  }
  assert.throws(() => validateEndpoints({ handlerUrl: "https://localhost/handler" }), /FEDERATO_HANDLER_URL/);
});

test("configured endpoints and audience are used with server-side credentials and cached tokens", async () => {
  const endpoints = { authUrl: "https://auth.product.federato.ai/custom-token", audience: "https://product.federato.ai/custom-api", handlerUrl: "https://product.federato.ai/custom-handler?outputOnly=true" };
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const client = new FederatoClient({ clientId: "fixture", clientSecret: "private" }, async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    if (String(url) === endpoints.authUrl) return Response.json({ access_token: "token", expires_in: 3600 });
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer token");
    assert.ok(!String(init?.body).includes("private"));
    return Response.json({});
  }, endpoints);
  await client.schema();
  await client.schema();
  assert.deepEqual(calls.map((call) => call.url), [endpoints.authUrl, endpoints.handlerUrl, endpoints.handlerUrl]);
  assert.equal(calls[0].body.audience, endpoints.audience);
  assert.equal(calls[0].body.grant_type, "client_credentials");
});
