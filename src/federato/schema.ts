import { z } from "zod";

export const concepts = ["account", "state", "business", "line", "tiv", "premium", "year", "constructionPercent", "lossValue", "effective", "expiration"] as const;
export type Concept = typeof concepts[number];
type Field = { type: string; fields?: Record<string, Field>; itemSchema?: Field; resource?: string; cardinality?: string };
export type Schema = Record<string, Field>;
export type Leaf = { path: string; type: string; many: boolean; references: string[] };
export type Mapping = Partial<Record<Concept, string>>;
export type Derivations = { buildings?: string; locations?: string; claims?: string; currency?: string };
export type Plan = { derivations: Derivations; resource: string; id: string; mapping: Mapping; leaves: Leaf[]; select: Record<string, unknown>; reasoning: string[] };
const fieldSchema: z.ZodType<Field> = z.lazy(() => z.object({
  type: z.string(), fields: z.record(z.string(), fieldSchema).optional(), itemSchema: fieldSchema.optional(), resource: z.string().optional(), cardinality: z.string().optional(),
}));
// Match explicit business concepts; never equate loss count with loss dollars or policy limit with TIV.
const aliases: Record<Concept, string[]> = {
  account: ["accountname", "insuredname", "insured.name", "account.name"],
  state: ["primaryriskstate", "primarystate", "riskstate", "state"],
  business: ["submissiontype", "businesstype"], line: ["lineofbusiness", "producttype"],
  tiv: ["totaltiv", "totalinsuredvalue", "tiv"], premium: ["totalpremium", "premium"],
  year: ["yearbuilt", "buildingyear", "constructionyear"],
  constructionPercent: ["acceptableconstructionpercent", "eligibleconstructionpercent"],
  lossValue: ["fiveyearlossvalue", "fiveyearlosstotal", "lossvalue5years", "losses5yearstotal"],
  effective: ["effectivedate", "targeteffectivedate", "dates.effective"], expiration: ["expirationdate", "dates.expiration"],
};
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9.]/g, "");

export function planQuery(raw: unknown, options: { resource?: string; mapping?: Mapping } = {}): Plan {
  const parsed = z.record(z.string(), fieldSchema).safeParse(raw);
  if (!parsed.success) throw new Error("Unexpected Federato schema. Expected a resource map with type/fields; inspect the saved schema.");
  const schema = parsed.data;
  const candidates = Object.keys(schema).filter((key) => /^(submission|policy)$/i.test(key));
  const rankedResources = candidates.map((name) => ({ name, coverage: Object.keys(schema[name].fields ?? {}).filter((key) => Object.values(aliases).flat().includes(normalize(key))).length })).sort((a, b) => b.coverage - a.coverage);
  const resource = options.resource ?? candidates.find((name) => name === "Submission") ?? (rankedResources.length && (rankedResources.length === 1 || rankedResources[0].coverage > rankedResources[1].coverage) ? rankedResources[0].name : undefined);
  if (!resource || !schema[resource]?.fields) throw new Error("Set FEDERATO_RESOURCE to a discovered submission/policy resource; selection is missing or ambiguous.");
  const leaves: Leaf[] = [];
  function walk(field: Field, path: string, many: boolean, references: string[], ancestors: string[], depth: number) {
    if (depth > 8) return;
    if (field.type === "reference") {
      if (!field.resource || !schema[field.resource] || ancestors.includes(field.resource)) return;
      walk(schema[field.resource], path, many || field.cardinality === "many", [...references, path], [...ancestors, field.resource], depth + 1);
    } else if (field.type === "array" && field.itemSchema) {
      walk(field.itemSchema, path, true, references, ancestors, depth + 1);
    } else if (field.fields) {
      for (const [key, child] of Object.entries(field.fields)) walk(child, path ? `${path}.${key}` : key, many, references, ancestors, depth + 1);
    } else if (path) leaves.push({ path, type: field.type, many, references });
  }
  walk(schema[resource], "", false, [], [resource], 0);
  const id = leaves.find((leaf) => leaf.path === "id" && !leaf.many);
  if (!id) throw new Error(`Resource ${resource} requires a scalar id for stable pagination and deduplication.`);
  const mapping: Mapping = {};
  const reasoning = [`Selected ${resource}${options.resource ? " by explicit resource selection" : resource === "Submission" ? " as the submission queue" : " by available appetite-field coverage"}. Evaluate all lifecycle statuses; no undocumented open-status filter is assumed. Retain incomplete and outside-appetite records.`];
  for (const concept of concepts) {
    const override = options.mapping?.[concept];
    let matches = leaves.filter((leaf) => {
      const path = normalize(leaf.path), tail = path.split(".").at(-1)!;
      return aliases[concept].some((alias) => alias.includes(".") ? path === alias : tail === alias);
    });
    // Totals must be policy-level scalars, not individual building premiums/TIVs.
    if (concept !== "account") matches = matches.filter((leaf) => !leaf.path.startsWith("insured.") && !leaf.path.startsWith("submission."));
    if (concept !== "year") matches = matches.filter((leaf) => !leaf.many);
    if (matches.length > 1) {
      const minimumDepth = Math.min(...matches.map((leaf) => leaf.path.split(".").length));
      matches = matches.filter((leaf) => leaf.path.split(".").length === minimumDepth);
    }
    if (override) {
      const leaf = leaves.find((item) => item.path === override);
      if (!leaf) throw new Error(`Mapping ${concept} points to an undiscovered field: ${override}`);
      if (leaf.many && concept !== "year") throw new Error(`Mapping ${concept} crosses an array; supply a policy-level aggregate instead.`);
      matches = [leaf];
    }
    if (matches.length === 1) { mapping[concept] = matches[0].path; reasoning.push(`${concept}: request ${matches[0].path} to evaluate the supplied guideline or required account context.`); }
    else reasoning.push(`${concept}: ${matches.length ? "ambiguous fields" : "no explicit field"}; report unknown rather than inventing data. Configure a schema-validated mapping if appropriate.`);
  }
  const derivations: Derivations = {};
  const extraPaths: string[] = [];
  // Only policy exposure buildings count; the insured's headquarters is not the insured risk.
  const buildingRoots = [...new Set(leaves.filter((leaf) => /(?:^|\.)exposure_units\.location\.buildings\.id$/.test(leaf.path)).map((leaf) => leaf.path.slice(0, -3)))];
  if (buildingRoots.length === 1) {
    const root = buildingRoots[0];
    const paths = ["id", "tiv", "year_built", "construction_type"].map((name) => `${root}.${name}`);
    if (paths.every((path) => leaves.some((leaf) => leaf.path === path))) {
      derivations.buildings = root;
      if (!options.mapping?.year) mapping.year = `${root}.year_built`;
      extraPaths.push(...paths);
      const location = root.slice(0, -".buildings".length);
      if (["id", "state"].every((key) => leaves.some((leaf) => leaf.path === `${location}.${key}`))) {
        derivations.locations = location;
        extraPaths.push(`${location}.id`, `${location}.state`);
      }
      reasoning.push("Fetch unique exposure buildings to sum building TIV and assess the oldest building. Use construction share by unique building count as an explicit application assumption. Infer state only when every exposure location agrees; otherwise request the primary risk state.");
    }
  }
  const claimPaths = ["id", "date_of_loss", "paid_indemnity", "paid_expense", "reserve_indemnity", "reserve_expense"].map((key) => `claims.${key}`);
  if (claimPaths.every((path) => leaves.some((leaf) => leaf.path === path))) {
    derivations.claims = "claims"; extraPaths.push(...claimPaths);
    reasoning.push("Request dated claims and paid/reserved amounts. Policy-linked claims establish only a lower bound, not complete five-year account history; insufficient history remains unknown.");
  }
  if (leaves.some((leaf) => leaf.path === "currency" && !leaf.many)) { derivations.currency = "currency"; extraPaths.push("currency"); }
  const select: Record<string, unknown> = { [id.path]: true };
  for (const path of [...Object.values(mapping), ...extraPaths]) {
    const leaf = leaves.find((item) => item.path === path)!;
    let node = select;
    const parts = path.split(".");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) { node[part] = true; break; }
      const prefix = parts.slice(0, i + 1).join(".");
      if (leaf.references.includes(prefix)) {
        node[part] ??= { $expand: { select: {} } };
        node = ((node[part] as { $expand: { select: Record<string, unknown> } }).$expand.select);
      } else { node[part] ??= {}; node = node[part] as Record<string, unknown>; }
    }
  }
  reasoning.push("Expand only references needed by selected appetite fields; avoid N+1 lookups. Paginate by stable id, without filtering arrays using dot-paths.");
  return { derivations, resource, id: id.path, mapping, leaves, select, reasoning };
}

export function readValues(value: unknown, path: string): unknown[] {
  function read(current: unknown, parts: string[]): unknown[] {
    if (Array.isArray(current)) return current.flatMap((item) => read(item, parts));
    if (!parts.length) return [current];
    if (!current || typeof current !== "object") return [undefined];
    return read((current as Record<string, unknown>)[parts[0]], parts.slice(1));
  }
  return read(value, path.split("."));
}
