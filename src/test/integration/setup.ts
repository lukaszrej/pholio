// Integration test global setup — runs before every integration test file.
// .env.test is loaded by vitest.integration.config.ts via loadEnv and injected via the env option.
// This file verifies the env is present and that the local Supabase instance is reachable.
export {};

const url = process.env.SUPABASE_URL;

if (!url) {
  throw new Error(
    "SUPABASE_URL is not set. " + "Create .env.test at the project root with the values from: npx supabase status",
  );
}

const healthUrl = `${url}/auth/v1/health`;

try {
  const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`Unexpected health-check status: ${response.status}`);
  }
} catch (err) {
  throw new Error(
    `Cannot reach local Supabase at ${url}.\n` +
      `Start it with: npx supabase start\n` +
      `Original error: ${err instanceof Error ? err.message : String(err)}`,
  );
}
