import { readValues, type Concept, type Mapping } from "./schema";

export type Criterion = { concept: Concept; factor: string; status: "target" | "acceptable" | "outside" | "unknown"; points: number; maximum: number; detail: string; source: string };
export type ScoreAdjustment = { label: string; points: number; detail: string; source: string };
/** `score` is the priority used for ranking; when public property records moved it, `baseScore` holds the appetite-only value and `adjustments` list every point. `rawScore` is the uncapped carrier match. */
export type RankedSubmission = { id: string; account: string; score: number; rawScore: number; recommendation: string; explanation: string; criteria: Criterion[]; missingData: string[]; evidenceNote?: string; lifecycleStatus?: string; baseScore?: number; adjustments?: ScoreAdjustment[]; };
export const guidelineVersion = "Federato HTN 2026 / 2025 sample commercial property appetite";
const targetStates = ["OH", "PA", "MD", "CO", "CA", "FL"];
const acceptableStates = [...targetStates, "NC", "SC", "GA", "VA", "UT"];
const normalized = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase().replace(/[_-]/g, " ") : null;
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export function scoreSubmission(row: Record<string, unknown>, mapping: Mapping, idPath = "id", asOf = new Date()): RankedSubmission {
  const values = (key: Concept) => mapping[key] ? readValues(row, mapping[key]!) : [undefined];
  const value = (key: Concept) => { const found = values(key); return found.length === 1 ? found[0] : undefined; };
  const criteria: Criterion[] = [];
  function add(key: Concept, factor: string, maximum: number, status: Criterion["status"], detail: string) {
    criteria.push({ concept: key, factor, maximum, status, points: status === "target" ? maximum : status === "acceptable" ? maximum * 0.8 : 0, detail, source: mapping[key] ?? "No unambiguous schema field" });
  }
  const business = normalized(value("business"));
  add("business", "Submission type", 10, business === null ? "unknown" : ["renewal", "renewal business"].includes(business) ? "outside" : ["new", "new business"].includes(business) ? "acceptable" : "unknown", `New business is acceptable; renewal business is not acceptable. Observed ${business ?? "missing"}.`);
  const line = normalized(value("line"));
  add("line", "Line of business", 10, line === null ? "unknown" : ["property", "commercial property"].includes(line) ? "acceptable" : "outside", `Property required; observed ${line ?? "missing"}.`);
  const state = typeof value("state") === "string" ? String(value("state")).trim().toUpperCase() : null;
  add("state", "Primary risk state", 15, state === null ? "unknown" : targetStates.includes(state) ? "target" : acceptableStates.includes(state) ? "acceptable" : "outside", `Target ${targetStates.join("/")}; also acceptable NC/SC/GA/VA/UT. Observed ${state ?? "missing"}.`);
  const tiv = number(value("tiv"));
  add("tiv", "Total insured value", 15, tiv === null || tiv === 0 ? "unknown" : tiv > 150_000_000 ? "outside" : tiv >= 50_000_000 && tiv <= 100_000_000 ? "target" : "acceptable", `Up to $150M; target $50M-$100M. Observed ${tiv === null ? "missing/invalid" : `$${tiv.toLocaleString("en-US")}`}.`);
  const premium = number(value("premium"));
  add("premium", "Total premium", 15, premium === null ? "unknown" : premium < 50_000 || premium > 175_000 ? "outside" : premium >= 75_000 && premium <= 100_000 ? "target" : "acceptable", `$50K-$175K; target $75K-$100K. Observed ${premium === null ? "missing/invalid" : `$${premium.toLocaleString("en-US")}`}.`);
  const years = values("year").map(number);
  const validYears = years.filter((item): item is number => item !== null && Number.isInteger(item) && item >= 1800 && item <= asOf.getUTCFullYear());
  const oldestKnown = validYears.length ? Math.min(...validYears) : null;
  // A known old building is an exception even when another building lacks its year.
  const year = oldestKnown !== null && (oldestKnown < 1990 || validYears.length === years.length) ? oldestKnown : null;
  add("year", "Building age", 15, year === null || year === 1990 ? "unknown" : year < 1990 ? "outside" : year > 2010 ? "target" : "acceptable", `Newer than 1990; target newer than 2010. Oldest supplied building: ${year ?? "missing/invalid"}. Exactly 1990 needs clarification because the guide leaves that boundary undefined.`);
  const construction = number(value("constructionPercent"));
  add("constructionPercent", "Construction mix", 10, construction === null || construction > 100 || construction === 50 ? "unknown" : construction > 50 ? "acceptable" : "outside", `More than 50% JM, non-combustible/steel, or masonry non-combustible is acceptable. Eligible share: ${construction === null ? "missing" : `${construction}%`}. Exactly 50% needs clarification; percentages must use 0-100 units.`);
  const loss = number(value("lossValue"));
  add("lossValue", "Five-year loss value", 10, loss === null || loss === 100_000 ? "unknown" : loss < 100_000 ? "target" : "outside", `Five-year loss dollars under $100K required. Observed ${loss === null ? "missing" : `$${loss.toLocaleString("en-US")}`}. Exactly $100K needs clarification; loss value comes from dollar figures, separate from the loss count.`);
  const missingData: string[] = [];
  const account = value("account");
  if (typeof account !== "string" || !account.trim()) missingData.push("account name");
  const date = (key: "effective" | "expiration") => {
    const v = value(key);
    const valid = typeof v === "string" && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v.slice(0, 10)).toISOString().slice(0, 10) === v.slice(0, 10);
    if (!valid) missingData.push(`${key} date`);
    return valid ? Date.parse(v as string) : null;
  };
  const effective = date("effective"), expiration = date("expiration");
  if (effective !== null && expiration !== null && expiration <= effective) missingData.push("valid effective/expiration date order");
  const outside = criteria.filter((item) => item.status === "outside");
  const unknown = criteria.filter((item) => item.status === "unknown");
  missingData.push(...unknown.map((item) => item.factor));
  const rawScore = Math.round(criteria.reduce((sum, item) => sum + item.points, 0));
  // These weights/caps are product choices, not rules supplied by the carrier.
  const score = Math.min(rawScore, outside.length ? 49 : missingData.length ? 69 : 100);
  const recommendation = outside.length ? "Refer for appetite exceptions" : missingData.length ? "Investigate missing or ambiguous data" : "Review for acceptance";
  const matches = criteria.filter((item) => ["target", "acceptable"].includes(item.status)).map((item) => item.factor.toLowerCase());
  const explanation = [
    `Score ${score}/100: ${matches.length ? `matches ${matches.join(", ")}` : "no verified appetite matches"}.`,
    `${outside.length ? `Exceptions: ${outside.map((item) => item.factor.toLowerCase()).join(", ")}. ` : ""}${missingData.length ? `Clarify ${missingData.join(", ")}. ` : ""}Recommendation: ${recommendation.toLowerCase()}; an underwriter makes the final decision.`,
    score !== rawScore ? `The raw ${rawScore}-point match score is capped at ${outside.length ? 49 : 69} to keep exceptions or incomplete evidence below fully verified matches.` : "",
  ].filter(Boolean).join(" ");
  return { id: String(readValues(row, idPath)[0]), account: typeof account === "string" && account.trim() ? account : "Unknown account", score, rawScore, recommendation, explanation, criteria, missingData };
}
