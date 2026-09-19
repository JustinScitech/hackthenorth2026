import assert from "node:assert/strict";
import test from "node:test";
import { authBaseUrl, databaseUrl, isLocalUrl, mongoUri, withPgCompat } from "./env";

const tiger = "postgres://user:pw@example.tsdb.cloud.timescale.com:37530/tsdb?sslmode=require";
const atlas = "mongodb+srv://user:pw@cluster.example.mongodb.net/?appName=x";

test("local runs use the primary variables as written", () => {
  const env = { DATABASE_URL: "postgres://u:p@localhost:5432/db", MONGODB_URI: "mongodb://localhost:27017", TIGERDATA_DATABASE_URL: tiger, MONGODB_ATLAS_URI: atlas };
  assert.equal(databaseUrl(env), env.DATABASE_URL);
  assert.equal(mongoUri(env), env.MONGODB_URI);
});

test("local runs fall back to hosted targets when the primary is unset", () => {
  assert.equal(databaseUrl({ TIGERDATA_DATABASE_URL: tiger }), `${tiger}&uselibpqcompat=true`);
  assert.equal(mongoUri({ MONGODB_ATLAS_URI: atlas }), atlas);
  assert.throws(() => databaseUrl({}), /DATABASE_URL is required/);
});

test("deployed runs never use localhost and prefer hosted targets", () => {
  const env = { VERCEL: "1", DATABASE_URL: "postgres://u:p@localhost:5432/db", MONGODB_URI: "mongodb://127.0.0.1:27017", TIGERDATA_DATABASE_URL: tiger, MONGODB_ATLAS_URI: atlas };
  assert.equal(databaseUrl(env), `${tiger}&uselibpqcompat=true`);
  assert.equal(mongoUri(env), atlas);
});

test("deployed runs accept a hosted primary and explain a missing or localhost one", () => {
  assert.equal(databaseUrl({ VERCEL: "1", DATABASE_URL: tiger }), `${tiger}&uselibpqcompat=true`);
  assert.throws(() => databaseUrl({ VERCEL: "1", DATABASE_URL: "postgres://u:p@localhost:5432/db" }), /points at localhost, which does not exist on Vercel/);
  assert.throws(() => databaseUrl({ VERCEL_ENV: "production" }), /DATABASE_URL is not set.*Vercel project environment/);
  assert.throws(() => mongoUri({ VERCEL: "1", MONGODB_URI: "mongodb://localhost:27017" }), /MONGODB_URI points at localhost/);
});

test("pg compatibility flag is added once, only for hosted sslmode URLs", () => {
  assert.equal(withPgCompat(tiger), `${tiger}&uselibpqcompat=true`);
  assert.equal(withPgCompat(`${tiger}&uselibpqcompat=true`), `${tiger}&uselibpqcompat=true`);
  assert.equal(withPgCompat("postgres://u:p@db.example.com/app"), "postgres://u:p@db.example.com/app");
  assert.equal(withPgCompat("postgres://u:p@localhost:5432/db?sslmode=require"), "postgres://u:p@localhost:5432/db?sslmode=require");
});

test("localhost detection covers the usual spellings", () => {
  for (const url of ["postgres://a:b@localhost:5432/x", "postgres://a:b@127.0.0.1/x", "mongodb://[::1]:27017", "postgres://a:b@0.0.0.0:5432/x"]) assert.equal(isLocalUrl(url), true, url);
  for (const url of [tiger, atlas]) assert.equal(isLocalUrl(url), false, url);
});

test("auth base URL follows the environment", () => {
  assert.equal(authBaseUrl({}), "http://localhost:3000");
  assert.equal(authBaseUrl({ BETTER_AUTH_URL: "http://localhost:3003/" }), "http://localhost:3003");
  assert.equal(authBaseUrl({ VERCEL: "1", VERCEL_ENV: "production", BETTER_AUTH_URL: "http://localhost:3000", VERCEL_PROJECT_PRODUCTION_URL: "astra-risk.vercel.app", VERCEL_URL: "astra-risk-abc123.vercel.app" }), "https://astra-risk.vercel.app");
  assert.equal(authBaseUrl({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "astra-risk-abc123.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "astra-risk.vercel.app" }), "https://astra-risk-abc123.vercel.app");
  assert.equal(authBaseUrl({ VERCEL: "1", VERCEL_ENV: "production", BETTER_AUTH_URL: "https://underwriting.example.com/" }), "https://underwriting.example.com");
  assert.throws(() => authBaseUrl({ VERCEL: "1" }), /BETTER_AUTH_URL is not set and no Vercel URL/);
});
