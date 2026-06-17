// Stub for astro:env/server virtual module — used by Vitest only.
// FINNHUB_API_KEY is let so tests can reassign it; Phase 3 also uses vi.mock getter pattern.
// SUPABASE_URL/SUPABASE_KEY are read from process.env so the integration suite gets real local values
// while unit tests (which don't set these vars) receive undefined and the null-client path is taken.
// eslint-disable-next-line prefer-const -- exported let; tests reassign it directly
export let FINNHUB_API_KEY: string | undefined = "test-key";
export const SUPABASE_URL: string | undefined = process.env.SUPABASE_URL;
export const SUPABASE_KEY: string | undefined = process.env.SUPABASE_KEY;
