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
      // A fake microphone lets the voice mode tests open the audio graph without a prompt.
      launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"], ...(existsSync(localChrome) ? { executablePath: localChrome } : {}) },
    },
  }],
  webServer: {
    command: "node --env-file-if-exists=.env --import tsx scripts/e2e-server.ts",
    url: `http://localhost:${port}/sign-in`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
