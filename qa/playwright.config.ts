import { defineConfig, devices } from "@playwright/test";

// The automated QA suite (Part A of the QA plan): real browsers against the
// local site, with QA guests seeded into the local database. Run with
// `npm run qa` (everything) or `npm run qa:browser` (just these).
//
// Two servers of its own: a dev server (4322, not your usual 4321, with
// its own Vite cache so it can't trip over yours) for the flows, where
// admin needs no login; and a production build (4399) for the Content
// Security Policy, which only the built site sends. If one's already
// running on its port it's reused: stop it first (`npx astro preview stop`)
// to test a fresh build. Never add --host: dev admin has no login.
export default defineConfig({
  testDir: "./tests",
  // the tests share one local database, so one at a time
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  outputDir: "./test-results",
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  use: {
    baseURL: "http://localhost:4322",
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
  projects: [
    { name: "flows", testIgnore: /csp\.spec\.ts/ },
    { name: "csp", testMatch: /csp\.spec\.ts/ },
  ],
  webServer: [
    {
      command: "npx astro dev --port 4322 --ignore-lock",
      url: "http://localhost:4322/",
      env: { QA_VITE_CACHE: "node_modules/.vite-qa" },
      reuseExistingServer: true,
      timeout: 120_000,
      cwd: "..",
    },
    {
      command: "npx astro build && npx astro preview --port 4399 --ignore-lock",
      url: "http://localhost:4399/",
      reuseExistingServer: true,
      timeout: 240_000,
      cwd: "..",
    },
  ],
});
