import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";

// Local Supabase creds for the E2E auth fixture (tests/e2e/auth.setup.ts) and
// the dev server it drives. Mirrors vitest.integration.config.ts: `.env.test`
// points at `supabase start`, not the remote project in `.env`. Requires
// local Supabase running — the setup project fails fast with a clear message
// if it isn't.
const env = loadEnv("test", process.cwd(), "");
for (const [key, value] of Object.entries(env)) {
  process.env[key] = value;
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    // Deliberately not 4321: avoids colliding with a dev server you may
    // already have running there — this one is spun up fresh per test run.
    baseURL: "http://localhost:4610",
    trace: "on-first-retry",
  },

  projects: [
    // Runs once, signs in without touching the UI, saves the session to
    // playwright/.auth/user.json. Every other project depends on it.
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],

  /* Boots the real Astro dev server against local Supabase for the whole run. */
  webServer: {
    command: "npm run dev -- --port 4610",
    url: "http://localhost:4610",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env,
  },

  // Deletes the auth-fixture test user created by auth.setup.ts.
  globalTeardown: "./tests/e2e/global-teardown.ts",
});
