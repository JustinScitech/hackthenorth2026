import { db } from "./db";
import type { QuoteEstimate, QuoteResult } from "../quote/types";

/**
 * Persisted quote requests. Only the facts the assistant heard and the latest
 * outcome are stored, never the person's free text, so the workspace can see
 * demand and referrals without holding a transcript.
 */
export type QuoteRecord = {
  id: string;
  product: "tenant" | "auto" | null;
  status: "choosing" | "needs_info" | "estimate" | "refer";
  province: string | null;
  estimate: QuoteEstimate | null;
  heard: Record<string, string | number | boolean>;
  openQuestions: number;
  referral: string | null;
  model: string | null;
  turns: number;
  createdAt: string;
  updatedAt: string;
};

export type QuoteSnapshot = {
  id: string;
  product: "tenant" | "auto" | null;
  heard: Record<string, string | number | boolean>;
  result: QuoteResult | null;
  model: string | null;
};

/** Upserts the latest state of a conversation; each call is one more turn. */
export async function saveQuote(snapshot: QuoteSnapshot): Promise<void> {
  const status: QuoteRecord["status"] = snapshot.result?.status ?? "choosing";
  const province = typeof snapshot.heard.province === "string" ? snapshot.heard.province : null;
  const referral = snapshot.result?.status === "refer" ? snapshot.result.recommendation.slice(0, 300) : null;
  await db.query(
    `INSERT INTO quotes (id, product, status, province, estimate, heard, open_questions, referral, model)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET product = EXCLUDED.product, status = EXCLUDED.status, province = EXCLUDED.province,
       estimate = EXCLUDED.estimate, heard = EXCLUDED.heard, open_questions = EXCLUDED.open_questions, referral = EXCLUDED.referral,
       model = COALESCE(EXCLUDED.model, quotes.model), turns = quotes.turns + 1, updated_at = now()`,
    [snapshot.id, snapshot.product, status, province, snapshot.result?.estimate ? JSON.stringify(snapshot.result.estimate) : null,
      JSON.stringify(snapshot.heard), snapshot.result?.questions.length ?? 0, referral, snapshot.model],
  );
}

export async function listQuotes(limit = 50): Promise<QuoteRecord[]> {
  const result = await db.query("SELECT * FROM quotes ORDER BY updated_at DESC LIMIT $1", [limit]);
  return result.rows.map((row) => ({
    id: String(row.id), product: row.product as QuoteRecord["product"], status: row.status as QuoteRecord["status"],
    province: row.province as string | null, estimate: row.estimate as QuoteEstimate | null,
    heard: (row.heard as QuoteRecord["heard"]) ?? {}, openQuestions: Number(row.open_questions), referral: row.referral as string | null,
    model: row.model as string | null, turns: Number(row.turns),
    createdAt: new Date(row.created_at as string).toISOString(), updatedAt: new Date(row.updated_at as string).toISOString(),
  }));
}
