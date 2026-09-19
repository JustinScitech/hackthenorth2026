import { readValues, type Mapping, type Plan } from "./schema";

const numeric = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const text = (value: unknown) => typeof value === "string" ? value.toLowerCase().replace(/[_-]/g, " ").trim() : "";
// Enumerated labels only; unknown labels cannot establish an acceptable mix.
const acceptableConstruction = ["jm", "joisted masonry", "non combustible", "steel", "non combustible/steel", "masonry non combustible", "mnc"];
const otherConstruction = ["frame", "wood", "wood frame", "fire resistive", "modified fire resistive"];
function objects(row: unknown, path: string) {
  const values = readValues(row, path);
  const unique = new Map<string, Record<string, unknown>>();
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string" && typeof item.id !== "number") return null;
    const previous = unique.get(String(item.id));
    if (previous && JSON.stringify(previous) !== JSON.stringify(item)) return null;
    unique.set(String(item.id), item);
  }
  return [...unique.values()];
}
export function deriveFacts(row: Record<string, unknown>, plan: Plan, asOf: Date) {
  const derived: Record<string, unknown> = {};
  const mapping: Mapping = { ...plan.mapping };
  const sources: Partial<Record<keyof Mapping, string>> = {};
  const set = (key: keyof Mapping, value: unknown, source: string) => {
    if (mapping[key]) return;
    mapping[key] = `__derived.${key}`; derived[key] = value; sources[key] = source;
  };
  const roots = plan.derivations;
  const buildings = roots.buildings ? objects(row, roots.buildings) : null;
  if (buildings?.length) {
    const total = buildings.every((item) => numeric(item.tiv) && item.tiv > 0) ? buildings.reduce((sum, item) => sum + Number(item.tiv), 0) : null;
    set("tiv", total, `Sum of unique ${roots.buildings}.tiv; incomplete buildings leave the total unknown`);
    // Override inferred year paths from headquarters; explicit overrides are handled in planning.
    set("year", buildings.map((item) => item.year_built), `Oldest unique ${roots.buildings}.year_built`);
    const known = buildings.every((item) => [...acceptableConstruction, ...otherConstruction].includes(text(item.construction_type)));
    const eligible = total && known ? buildings.reduce((sum, item) => sum + (acceptableConstruction.includes(text(item.construction_type)) ? Number(item.tiv) : 0), 0) / total * 100 : null;
    set("constructionPercent", eligible, `${roots.buildings}.construction_type weighted by building TIV; weighting is an application assumption, not specified by the guide`);
  }
  const locations = roots.locations ? objects(row, roots.locations) : null;
  if (locations?.length) {
    const states = locations.map((item) => typeof item.state === "string" ? item.state.trim().toUpperCase() : null);
    const unique = new Set(states);
    set("state", !states.includes(null) && unique.size === 1 ? states[0] : null, `${roots.locations}.state; only inferred when every insured location has the same state`);
  }
  let lossLowerBound: number | null = null;
  const claims = roots.claims ? objects(row, roots.claims) : null;
  if (claims?.length) {
    const start = new Date(asOf); start.setUTCFullYear(start.getUTCFullYear() - 5);
    const amounts = ["paid_indemnity", "paid_expense", "reserve_indemnity", "reserve_expense"];
    lossLowerBound = claims.reduce((sum, claim) => {
      const when = typeof claim.date_of_loss === "string" ? Date.parse(claim.date_of_loss) : NaN;
      if (!Number.isFinite(when) || when < start.getTime() || when > asOf.getTime() || !amounts.every((key) => numeric(claim[key]))) return sum;
      return sum + amounts.reduce((total, key) => total + Number(claim[key]), 0);
    }, 0);
    // Above-threshold observed claims prove an exception; absence cannot prove five-year completeness.
    if (lossLowerBound > 100_000) set("lossValue", lossLowerBound, `${roots.claims}: observed incurred losses (paid + reserves) in five years ending ${asOf.toISOString().slice(0, 10)}; lower bound only`);
  }
  const currency = roots.currency ? readValues(row, roots.currency)[0] : undefined;
  if (roots.currency && currency !== "USD") {
    for (const key of ["tiv", "premium", "lossValue"] as const) {
      mapping[key] = `__derived.${key}`; derived[key] = null;
      sources[key] = `Currency ${typeof currency === "string" ? currency : "missing"}; USD conversion required before applying dollar guidelines`;
    }
  }
  return { row: { ...row, __derived: derived }, mapping, sources, lossLowerBound };
}
