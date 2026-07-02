import { test as setup } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const authFile = "playwright/.auth/user.json";
const userMetaFile = "playwright/.auth/user-meta.json";

setup("authenticate", async ({ request }) => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.test) — run `supabase start` first.",
    );
  }

  // Unique per-run user so parallel runs and re-runs never collide.
  // Deleted by global-teardown.ts at the end of the run.
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const email = `e2e-seed-${tag}@test.invalid`;
  const password = "TestPass123!";

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`Failed to create E2E test user: ${error.message}`);

  mkdirSync(path.dirname(userMetaFile), { recursive: true });
  writeFileSync(userMetaFile, JSON.stringify({ userId: data.user.id }));

  // Authenticate without the UI: POST straight to the real sign-in route and
  // let Playwright's request context capture the session cookies it sets.
  // Astro rejects cross-site form POSTs by Origin header — api requests have
  // none by default, so it must be set to the app's own origin here.
  const response = await request.post("/api/auth/signin", {
    form: { email, password },
    headers: { origin: "http://localhost:4610" },
  });
  if (!response.ok() || !response.url().endsWith("/dashboard")) {
    throw new Error(`Sign-in POST failed: ${response.status()} ${response.url()}`);
  }

  await request.storageState({ path: authFile });
});
