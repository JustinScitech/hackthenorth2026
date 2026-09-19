import { z } from "zod";

const AUTH_URL = "https://auth.product.federato.ai/oauth/token";
const API_URL = "https://product.federato.ai/integrations-api/handlers/federato-hack-north?outputOnly=true";
const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() });
// The handler accepts a Mongo-flavored pipeline. Only resource is required by the API.
export type Query = {
  resource: string;
  where?: Record<string, unknown>;
  expand?: Record<string, unknown>;
  unwind?: (string | { path: string; type?: "inner" | "left" })[];
  filter?: Record<string, unknown>;
  over?: string[];
  select?: Record<string, unknown> | (string | Record<string, unknown>)[];
  sort?: { field: string; direction?: "asc" | "desc" }[];
  pagination?: { limit?: number; offset?: number };
};
export interface DataClient { schema(): Promise<unknown>; query(query: Query): Promise<{ rows: Record<string, unknown>[]; total: number }> }

export class FederatoClient implements DataClient {
  private token?: { value: string; expiresAt: number };
  constructor(private readonly credentials: { clientId: string; clientSecret: string }, private readonly request: typeof fetch = fetch) {
    if (!credentials.clientId || !credentials.clientSecret) throw new Error("Set FEDERATO_CLIENT_ID and FEDERATO_CLIENT_SECRET on the server to run live triage.");
  }
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const response = await this.request(AUTH_URL, {
      method: "POST", headers: { "Content-Type": "application/json" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ client_id: this.credentials.clientId, client_secret: this.credentials.clientSecret, audience: "https://product.federato.ai/core-api", grant_type: "client_credentials" }),
    });
    if (!response.ok) throw new Error(`Federato authentication failed (HTTP ${response.status}). Check the organizer-issued credentials.`);
    const parsed = tokenSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("Federato returned an invalid token response.");
    this.token = { value: parsed.data.access_token, expiresAt: Date.now() + parsed.data.expires_in * 1000 };
    return this.token.value;
  }
  private async call(action: "schema" | "query", payload?: Query): Promise<unknown> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const token = await this.accessToken();
      const response = await this.request(API_URL, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, ...(payload ? { payload } : {}) }),
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(25_000),
      });
      if (response.status === 401 && attempt === 0) { this.token = undefined; continue; }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retry = Number(response.headers.get("retry-after"));
        await new Promise((resolve) => setTimeout(resolve, Math.min(5000, Math.max(500, Number.isFinite(retry) ? retry * 1000 : 500 * 2 ** attempt))));
        continue;
      }
      // Never echo upstream bodies: they can contain credentials or submission data.
      if (!response.ok) throw new Error(`Federato ${action} failed (HTTP ${response.status}). Check credentials, schema mapping, and service availability.`);
      const result: unknown = await response.json();
      // The live challenge endpoint can retain this envelope even with outputOnly=true.
      const envelope = z.object({ output: z.tuple([z.object({ data: z.unknown() })]) }).safeParse(result);
      return envelope.success ? envelope.data.output[0].data : result;
    }
    throw new Error("Federato request retry limit reached.");
  }
  schema() { return this.call("schema"); }
  async query(query: Query) {
    const result = await this.call("query", query);
    // Ungrouped live queries use results; grouped examples in the guide use groups.
    const rows = z.array(z.record(z.string(), z.unknown()));
    const parsed = z.union([
      z.object({ total: z.number().int().nonnegative(), results: rows }).transform((data) => ({ rows: data.results, total: data.total })),
      z.object({ total: z.number().int().nonnegative(), groups: rows }).transform((data) => ({ rows: data.groups, total: data.total })),
    ]).safeParse(result);
    if (!parsed.success) throw new Error("Unexpected Federato query response; expected total plus results or groups.");
    return parsed.data;
  }
}
