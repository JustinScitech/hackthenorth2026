import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      browserName: "chromium",
      ...(existsSync(localChrome) ? { launchOptions: { executablePath: localChrome } } : {}),
    },
  }],
  webServer: {
    command: "node --env-file=.env --import tsx scripts/e2e-server.ts",
    url: `http://localhost:${port}/sign-in`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
