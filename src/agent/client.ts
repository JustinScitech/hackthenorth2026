import { Client, Connection } from "@temporalio/client";
import { temporalConfig } from "./temporal-config";

let clientPromise: Promise<Client> | undefined;

export function temporalClient(): Promise<Client> {
  const { connectionOptions, namespace } = temporalConfig();
  clientPromise ??= Connection.connect(connectionOptions)
    .then((connection) => new Client({ connection, namespace }))
    .catch((error) => { clientPromise = undefined; throw error; });
  return clientPromise;
}
