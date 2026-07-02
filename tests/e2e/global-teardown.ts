import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, rmSync } from "fs";

const userMetaFile = "playwright/.auth/user-meta.json";

// Cleans up the auth-fixture user created by auth.setup.ts — it's shared
// (via storageState) across every test in the run, so it's torn down once
// here rather than per-test.
export default async function globalTeardown(): Promise<void> {
  if (!existsSync(userMetaFile)) return;

  const { userId } = JSON.parse(readFileSync(userMetaFile, "utf-8")) as { userId: string };
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && serviceRoleKey) {
    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      throw new Error(`[global-teardown] failed to delete E2E test user ${userId}: ${error.message}`);
    }
  }

  rmSync(userMetaFile, { force: true });
}
