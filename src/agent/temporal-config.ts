type TemporalEnv = Partial<Pick<NodeJS.ProcessEnv, "TEMPORAL_ADDRESS" | "TEMPORAL_NAMESPACE" | "TEMPORAL_API_KEY">>;

export function temporalConfig(env: TemporalEnv = process.env as TemporalEnv) {
  const address = env.TEMPORAL_ADDRESS?.trim() || "localhost:7233";
  const namespace = env.TEMPORAL_NAMESPACE?.trim() || "default";
  const apiKey = env.TEMPORAL_API_KEY?.trim();

  if (apiKey && (!env.TEMPORAL_ADDRESS?.trim() || !env.TEMPORAL_NAMESPACE?.trim())) {
    throw new Error("TEMPORAL_ADDRESS and TEMPORAL_NAMESPACE are required with TEMPORAL_API_KEY");
  }
  if (address.endsWith(".tmprl.cloud:7233") && !apiKey) {
    throw new Error("TEMPORAL_API_KEY is required for Temporal Cloud");
  }

  return {
    namespace,
    connectionOptions: apiKey ? { address, tls: true, apiKey } : { address },
  };
}
