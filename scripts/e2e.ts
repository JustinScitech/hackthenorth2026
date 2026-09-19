import { spawn } from "node:child_process";

const port = 3217;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { stdio: "ignore", env: process.env });
const base = `http://127.0.0.1:${port}`;
const deadline = Date.now() + 30_000;

async function main() {
  try {
    let response: Response | undefined;
    while (Date.now() < deadline) {
      try {
        response = await fetch(`${base}/triage`);
        if (response.ok) break;
      } catch { /* The server is still starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!response?.ok) throw new Error("Next server did not become ready within 30 seconds.");
    const html = await response.text();
    if (!html.includes("Submission priorities") || !html.includes("Rank live submissions")) throw new Error("The triage page did not render its primary controls.");
    const blocked = await fetch(`${base}/api/triage`, { method: "POST", headers: { origin: "https://attacker.example" } });
    if (blocked.status !== 403) throw new Error(`Expected cross-origin triage request to return 403, received ${blocked.status}.`);
    console.log("E2E passed: triage page rendered and cross-origin API requests were blocked.");
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "E2E failed."); process.exitCode = 1; });
