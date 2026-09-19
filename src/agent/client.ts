import { Client, Connection } from "@temporalio/client";

let clientPromise: Promise<Client> | undefined;

export function temporalClient(): Promise<Client> {
  clientPromise ??= Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233" })
    .then((connection) => new Client({ connection }))
    .catch((error) => { clientPromise = undefined; throw error; });
  return clientPromise;
}
