// Stub for astro:env/server virtual module — used by Vitest only.
// Phase 3 tests override this via vi.mock factory (getter pattern) rather than direct reassignment.
// SUPABASE_URL/SUPABASE_KEY are read from process.env so the integration suite gets real local values
// while unit tests (which don't set these vars) receive undefined and the null-client path is taken.
export const FINNHUB_API_KEY: string | undefined = "test-key";
export const SUPABASE_URL: string | undefined = process.env.SUPABASE_URL;
export const SUPABASE_KEY: string | undefined = process.env.SUPABASE_KEY;
