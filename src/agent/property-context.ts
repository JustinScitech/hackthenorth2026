import { geocode, SOURCES, withSourceAbort, type Geocoded, type SourceId, type SourceResult } from "./context-sources";

/**
 * What the public record says about a property: where it is, and one result per dataset.
 * Stored on the case as JSON so the checks, the brief, the page, and the chat all read the
 * same thing, and a re-run after a broker reply reuses it instead of calling everything again.
 */
export type PropertyContext = {
  address: string;
  geocoded: Geocoded | null;
  geocodeUrl: string;
  sources: SourceResult[];
  gatheredAt: string;
};

export function contextSource<T>(context: PropertyContext | null | undefined, id: SourceId): SourceResult<T> | null {
  const found = context?.sources.find((source) => source.id === id);
  return found && found.status === "ok" ? (found as SourceResult<T>) : null;
}

/** Geocodes the address, then asks every dataset at once. A dataset that fails or times out is recorded as unavailable and the rest still land. */
export async function gatherPropertyContext(address: string, asOf = new Date(), only?: SourceId[], signal?: AbortSignal): Promise<PropertyContext> {
  return withSourceAbort(signal, async () => {
  signal?.throwIfAborted();
  const { geocoded, url: geocodeUrl } = await geocode(address);
  const gatheredAt = asOf.toISOString();
  if (!geocoded) return { address, geocoded: null, geocodeUrl, sources: [], gatheredAt };
  const ids = (Object.keys(SOURCES) as SourceId[]).filter((id) => !only || only.includes(id));
  const settled = await Promise.allSettled(ids.map((id) => SOURCES[id].run(geocoded, asOf)));
  signal?.throwIfAborted();
  const sources = settled.map((outcome, index): SourceResult => {
    const id = ids[index];
    if (outcome.status === "fulfilled") return outcome.value;
    const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
    return { id, label: SOURCES[id].label, status: "unavailable", url: "", summary: `Unavailable: ${reason.slice(0, 120)}.`, data: {}, ms: 0 };
  });
  return { address, geocoded, geocodeUrl, sources, gatheredAt };
  });
}
