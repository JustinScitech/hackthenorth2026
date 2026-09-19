import { z } from "zod";
import { concepts } from "./schema";
import { FederatoClient } from "./client";

export function liveConfiguration() {
  const raw = process.env.FEDERATO_FIELD_MAP;
  let mapping;
  try { mapping = raw ? z.partialRecord(z.enum(concepts), z.string().min(1)).parse(JSON.parse(raw)) : undefined; }
  catch { throw new Error("FEDERATO_FIELD_MAP must be a JSON object mapping supported appetite concepts to discovered field paths."); }
  return {
    client: new FederatoClient({ clientId: process.env.FEDERATO_CLIENT_ID ?? "", clientSecret: process.env.FEDERATO_CLIENT_SECRET ?? "" }),
    options: { resource: process.env.FEDERATO_RESOURCE || undefined, mapping },
  };
}
