import { spawn } from "node:child_process";
import { E2E_PORT, e2eEnvironment } from "./e2e-env";

const env = e2eEnvironment();
const worker = spawn(process.execPath, ["--import", "tsx", "src/agent/worker.ts"], {
  env, stdio: "inherit",
});
const server = spawn("node_modules/.bin/next", ["start", "-p", String(E2E_PORT)], {
  env, stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => { server.kill(signal); worker.kill(signal); });
}
worker.on("exit", (code) => { if (code) { server.kill(); process.exitCode = code; } });
server.on("exit", (code) => { worker.kill(); process.exit(code ?? process.exitCode ?? 0); });
