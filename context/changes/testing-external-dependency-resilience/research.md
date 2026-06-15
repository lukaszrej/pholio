---
date: 2026-06-15T00:00:00+00:00
researcher: claude-sonnet-4-6
git_commit: b0550a4f71e210a056b190467604df30ff4c64b6
branch: main
repository: Pholio
topic: "External dependency resilience — Finnhub fallback path, prices cache, and integration test grounding for Phase 3"
tags: [research, finnhub, prices-cache, supabase, integration-testing, fallback, dashboard]
status: complete
last_updated: 2026-06-15
last_updated_by: claude-sonnet-4-6
---

# Research: External Dependency Resilience (Phase 3)

**Date**: 2026-06-15  
**Researcher**: claude-sonnet-4-6  
**Git Commit**: b0550a4f71e210a056b190467604df30ff4c64b6  
**Branch**: main  
**Repository**: Pholio

---

## Research Question

Locate and fully characterise: (1) the Finnhub HTTP client; (2) where and how it is called during the server render; (3) the full fallback cascade (fetch → cache → UI); (4) the Supabase prices cache schema; (5) the existing integration-test infrastructure from Phase 2. Produce evidence to ground the Phase 3 integration test plan.

---

## Summary

The Finnhub client (`fetchQuote`) is clean and already returns `null` on all failure modes — timeout, 5xx, and `{c:0}`. The problem is architectural: **the entire fetch-or-fallback cascade lives inside the Astro server-side frontmatter of `dashboard.astro`**, not in a standalone importable function. This means writing a "mock HTTP + real Supabase" integration test requires extracting the cascade into a testable module first — otherwise there is nothing to call from a test file without a running Astro server. That extraction is the single most important prerequisite for Phase 3.

A secondary finding: the UI currently signals Finnhub failure via **gray text** (`#93a1b5`) for stale-cached prices and an **em-dash "—"** for positions with no price at all. Neither a ⚠ icon nor the literal text "brak danych" exists in the current codebase. The test plan's language implies those signals should exist; the plan will need to decide whether to add them as part of Phase 3 or treat the existing visual signals as sufficient.

---

## Detailed Findings

### 1. Finnhub Client (`src/lib/finnhub.ts`)

**Signature** (`src/lib/finnhub.ts:34`):

```typescript
export async function fetchQuote(ticker: string): Promise<number | null>;
```

**Timeout setup** (`src/lib/finnhub.ts:37-40`):

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => {
  controller.abort();
}, 2500);
```

The `controller.signal` is passed as `signal` to `fetch()` at line 44. The `clearTimeout` runs in `finally` at line 61. Timeout value: **2 500 ms**.

**Failure contract** — the function **never throws**; all failures return `null`:

| Failure mode                                | Code path                                                      | Line  |
| ------------------------------------------- | -------------------------------------------------------------- | ----- |
| Missing API key                             | `if (!FINNHUB_API_KEY) return null`                            | 35    |
| HTTP non-2xx (including 5xx)                | `if (!response.ok) return null`                                | 48    |
| Bad JSON shape                              | `if (typeof json !== "object" \|\| json === null) return null` | 51    |
| `{c: 0}` (no market data)                   | `if (!data.c \|\| data.c === 0) return null`                   | 53    |
| Any exception (incl. AbortError on timeout) | `catch(e) { console.error(...); return null; }`                | 56–59 |

The `c === 0` guard (line 53) and the timeout abort are the two cases that matter most for Phase 3: they are structurally identical from the caller's perspective (both produce `null`) but require different test-level mechanisms to trigger reliably.

**Import** (`src/lib/finnhub.ts:1`):

```typescript
import { FINNHUB_API_KEY } from "astro:env/server";
```

The same `astro:env/server` alias that unit tests already stub at `src/test/stubs/astro-env-server.ts:5` covers this import automatically in both unit and integration configs.

`fetchSector` (lines 3–32) follows an identical pattern and is also called from `dashboard.astro` (line 87), but is **out of scope for Phase 3** (only Risk #5 — prices — is in scope).

**Callers**: `src/pages/dashboard.astro:51` (server frontmatter). No other production caller exists; there is no standalone price-refresh endpoint.

---

### 2. Dashboard Server Render Path (`src/pages/dashboard.astro:33–64`)

The entire fetch-and-cache cascade runs synchronously inside the Astro SSR frontmatter on every page request:

```
dashboard.astro server frontmatter (lines 33–64)
│
├── SELECT * FROM prices WHERE ticker IN (uniqueTickers)   ← line 35
│   Build cacheMap: Map<ticker, {price, fetched_at}>
│
└── pLimit(10) + Promise.allSettled over uniqueTickers     ← lines 41–63
    │
    For each ticker:
    ├── if cacheMap[ticker].fetched_at date == today        ← line 46
    │     prices[ticker] = { ..., is_fresh: true }
    │     RETURN (skip Finnhub call)
    │
    ├── else: quote = await fetchQuote(ticker)              ← line 51
    │   ├── if quote !== null:
    │   │     UPSERT prices (ticker, quote, now())          ← line 54
    │   │     prices[ticker] = { ..., is_fresh: true }      ← line 57
    │   │
    │   └── if quote === null AND cached row exists:
    │         prices[ticker] = { ..., is_fresh: false }     ← line 59
    │         (cached price re-used, stale flag set)
    │
    └── if quote === null AND no cached row:
          ticker omitted from prices dict entirely
```

**Key observations**:

1. There is **no `try/catch` wrapping the `fetchQuote` call** in the dashboard. The caller relies entirely on `fetchQuote`'s internal null-return contract.
2. `Promise.allSettled` ensures one failed ticker does not abort others.
3. Upsert failures are **logged but swallowed** (line 56); a fresh price is still passed to the UI even if the cache write fails.
4. **The cascade is not extractable without a refactor.** It is inline in the `.astro` frontmatter — not a function that can be imported and called in a test.

---

### 3. UI Fallback Rendering (gap vs. test plan)

**`PriceData` type** (`src/lib/portfolio.ts:3–7`):

```typescript
export interface PriceData {
  price: number;
  fetched_at: string;
  is_fresh: boolean;
}
```

`is_fresh: false` means the price shown is stale (from cache; Finnhub failed or was skipped). A ticker absent from `prices` dict means `currentPrice === null` in the computed position.

**What the UI currently renders** (`src/components/portfolio/PortfolioSection.tsx`):

| State                              | Rendering                 | Line     |
| ---------------------------------- | ------------------------- | -------- |
| `is_fresh: false` (stale cache)    | Gray text color `#93a1b5` | 400, 582 |
| `currentPrice === null` (no price) | Em-dash `"—"`             | 591, 671 |

**What the test plan says should exist**:

> "dashboard renders with the last cached price and a ⚠ indicator; when no cache exists, 'brak danych' is shown without throwing"

**Discrepancy**: Neither a ⚠ icon nor the literal text "brak danych" is present in the current code. The current UI uses gray text and "—". Phase 3 must decide: (a) accept the current visual signals as meeting the risk-response intent, or (b) add ⚠ / "brak danych" as part of Phase 3 implementation. The test assertions will need to target whichever signals the code actually emits.

---

### 4. Supabase Prices Cache

**Schema** (`supabase/migrations/20260609000000_create_prices.sql`):

```sql
ticker   TEXT PRIMARY KEY
price    NUMERIC(15,4) NOT NULL CHECK (price > 0)
fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

- **Global** (no `user_id` column). All authenticated users share one price per ticker.
- Upsert key: `ticker` (it is the primary key).
- Freshness: date-only comparison — `fetched_at.split("T")[0] === today` (`dashboard.astro:46`).

**RLS policies** (`migrations/20260609000000`, amended by `20260609000001`):

| Operation | Policy                                                        |
| --------- | ------------------------------------------------------------- |
| SELECT    | `USING (auth.role() = 'authenticated')`                       |
| INSERT    | `WITH CHECK (auth.role() = 'authenticated')`                  |
| UPDATE    | `USING (...) WITH CHECK (...)` (both clauses, per lessons.md) |

Any authenticated user can read and write prices. Because prices are global (no user ownership), there is no cross-user scope issue here — a test user seeding a price row will be readable by any other authenticated client in the same test run.

**Cache miss** (`dashboard.astro:35,45`): `SELECT ... IN (uniqueTickers)` returns empty set → `cacheMap.get(ticker)` is `undefined` → `cached` is `undefined` → if `fetchQuote` also returns null, the ticker is omitted from `prices` entirely.

---

### 5. Integration Test Infrastructure (Phase 2 baseline)

**Runner config** (`vitest.integration.config.ts`):

```
environment: "node"
include: "src/**/*.integration.test.ts"
setupFiles: ["src/test/integration/setup.ts"]
envDir: "."       ← loads .env.test → process.env
```

Module alias: `"astro:env/server"` → `src/test/stubs/astro-env-server.ts`  
(same stub as unit config, but the stub reads `process.env.SUPABASE_URL` / `SUPABASE_KEY` — real local values in integration context)

**Run command** (`package.json:16`):

```
npm run test:integration
→ vitest run --config vitest.integration.config.ts
```

**Local Supabase** (`.env.test`):

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service-role key>
```

**Key infrastructure pieces available to Phase 3**:

| Artifact             | Location                                             | What it provides                                |
| -------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| Setup / health check | `src/test/integration/setup.ts`                      | Fails fast if local Supabase is not running     |
| Two-user fixture     | `src/test/integration/helpers/users.ts`              | Not needed for Phase 3 (prices table is global) |
| Env stub             | `src/test/stubs/astro-env-server.ts`                 | Already exposes mutable `FINNHUB_API_KEY`       |
| Middleware context   | `src/test/integration/helpers/middleware-context.ts` | Not needed for Phase 3                          |

**HTTP mocking**: Phase 2 used no HTTP mocking — all tests hit real Supabase only. Phase 3 will be the first to need it. Two options in the plain-Node environment:

| Option                      | Mechanism                | Notes                                                                                                                                                                                  |
| --------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vi.spyOn(global, "fetch")` | Vitest mock              | Simplest; works because `fetchQuote` calls the global `fetch`. Restore in `afterEach`.                                                                                                 |
| `undici` MockAgent          | `undici` (Node built-in) | More realistic intercept at the transport level; `undici` is already a Node built-in (no install needed). Test plan §4 names this; verify `undici` is importable without adding a dep. |

**No `@cloudflare/vitest-pool-workers`** is installed. The integration tests run in plain Node — `vi.spyOn(global, "fetch")` is the simpler and already-proven path given Phase 2's patterns. `undici` MockAgent is an option but adds surface area.

---

### 6. Architectural Prerequisite: Extract the Cascade

The single most important finding for planning: **no integration test can call the fetch-and-fallback cascade without a running Astro server**, because the cascade is inline in `dashboard.astro`'s server frontmatter.

**Proposed extraction** (`src/lib/prices.ts`):

```typescript
// proposed new module
export async function refreshPricesForTickers(
  tickers: string[],
  supabase: SupabaseClient,
): Promise<Record<string, PriceData>>;
```

This function would encapsulate exactly the logic currently at `dashboard.astro:33–64`. `dashboard.astro` would import and call it. Tests would import and call it directly, mocking `global.fetch` (which is what `fetchQuote` uses internally) to simulate Finnhub failure/timeout.

The plan must specify this extraction — without it there is nothing to test at the integration layer. It is low-risk (pure move, no logic change) and unlocks the entire Phase 3 test matrix.

---

## Code References

- `src/lib/finnhub.ts:34–63` — `fetchQuote` full implementation
- `src/lib/finnhub.ts:37–40` — AbortController + 2500ms timeout setup
- `src/lib/finnhub.ts:48` — `!response.ok → return null`
- `src/lib/finnhub.ts:53` — `c === 0 → return null`
- `src/lib/finnhub.ts:56–59` — catch block (AbortError from timeout lands here)
- `src/pages/dashboard.astro:33–64` — full fetch-and-cache cascade (inline, not extracted)
- `src/pages/dashboard.astro:46` — today-freshness guard (date string comparison)
- `src/pages/dashboard.astro:51` — `fetchQuote(ticker)` call
- `src/pages/dashboard.astro:54` — `supabase.from("prices").upsert(...)`
- `src/pages/dashboard.astro:58–59` — stale-cache fallback: `is_fresh: false`
- `src/lib/portfolio.ts:3–7` — `PriceData` interface (`price`, `fetched_at`, `is_fresh`)
- `src/lib/portfolio.ts:15–16` — `PortfolioPosition.currentPrice: number | null`, `.isFresh: boolean`
- `src/components/portfolio/PortfolioSection.tsx:400,582` — gray text for `!pos.isFresh`
- `src/components/portfolio/PortfolioSection.tsx:591,671` — `"—"` for null price (not "brak danych")
- `supabase/migrations/20260609000000_create_prices.sql` — prices table schema + RLS policies
- `supabase/migrations/20260609000001_fix_prices_update_policy.sql` — UPDATE policy WITH CHECK fix
- `vitest.integration.config.ts:9–23` — integration runner config (node env, .env.test, alias)
- `src/test/integration/setup.ts` — Supabase health check (fast-fail if not running)
- `src/test/stubs/astro-env-server.ts:5` — mutable `FINNHUB_API_KEY = "test-key"` stub
- `package.json:16` — `test:integration` script

---

## Architecture Insights

1. **fetchQuote is already well-hardened** — the function itself satisfies the testability requirement for Risk #5 at the unit layer (Phase 1 already covers this). The integration gap is the cascade, not the client.

2. **Global prices table is a test-setup simplification** — because `prices` has no `user_id`, Phase 3 tests do not need the two-user fixture from Phase 2. A single authenticated client (either an admin or a standard anon+JWT client) can seed and read prices freely.

3. **is_fresh flag is the observable signal** — the fallback does not throw, does not return an error type, and does not change the price value shown. The only machine-readable evidence that the fallback fired is `is_fresh: false` in the returned `PriceData`. Tests must assert on this flag (or its downstream effect on the computed position).

4. **AbortController timeout test challenge** — triggering the 2 500 ms timeout in a test requires either: (a) making the mocked fetch hang for >2 500 ms (slow, flaky), or (b) mocking `fetchQuote` to return `null` directly (fast but does not prove the timeout actually fires). The plan should acknowledge this tension and recommend a pragmatic path: mock `global.fetch` to return a never-resolving `Promise` and use Vitest fake timers (`vi.useFakeTimers()`) to advance past 2 500 ms. This is the only way to prove the AbortController path fires without real latency.

5. **Dashboard renders no explicit ⚠ indicator today** — the visual fallback signal is color (gray = stale) and em-dash (= no price). Any test that asserts on a ⚠ icon or "brak danych" string will fail against current code. Phase 3 must either enhance the UI or scope tests to the `is_fresh: false` + null-price signals.

---

## Historical Context (from prior changes)

- `context/archive/2026-06-09-portfolio-roi-view/plan.md` — The portfolio ROI view slice explicitly called out the `c === 0` guard and the fallback path as critical implementation details. Phase 1 (testing-business-logic-unit-suite) subsequently covered `fetchQuote` at the unit layer (`src/lib/finnhub.test.ts`). Phase 3 covers the next layer: integration with the cache.
- `context/changes/testing-business-logic-unit-suite/` (complete) — `src/lib/finnhub.test.ts` covers all `fetchQuote` failure modes at unit level (`vi.fn()` mock on `global.fetch`). Phase 3 must not duplicate these unit tests; it must cover the cascade integration (fetchQuote null → Supabase fallback).
- `context/changes/testing-api-security-integration/` (complete) — Established the Node-environment integration harness, `.env.test`, and the `src/test/integration/` directory structure. Phase 3 inherits all of this directly.

---

## Open Questions

1. **Extract or not?** The plan must decide: extract `dashboard.astro:33–64` into `src/lib/prices.ts` (recommended), or find another approach. Without extraction there is no seam for integration testing.

2. **⚠ / "brak danych" UI scope**: Accept gray text + "—" as satisfying Risk #5, or add explicit indicators as part of Phase 3? Affects the observable test assertions.

3. **Fake timers for AbortController**: `vi.useFakeTimers()` is the correct mechanism to trigger the 2 500 ms timeout without real latency — but it requires care when combined with real Supabase calls (which also use `fetch` internally). The plan should address whether to separate the timeout test (pure unit with mocked fetch) from the cache-fallback test (real Supabase + mocked Finnhub fetch only).

4. **`undici` MockAgent vs `vi.spyOn(global, "fetch")`**: Both work in the plain-Node environment. `vi.spyOn` is simpler and consistent with Phase 1's `finnhub.test.ts` pattern; `undici` MockAgent adds realism but complexity. Recommend `vi.spyOn` for consistency unless the plan author has a reason to diverge.

5. **`fetchSector` parallelism**: The dashboard also calls `fetchSector` (line 87). The cascade for sectors is structurally identical. If the extraction refactor happens, it makes sense to extract both together. Phase 3 scope is prices only — but the plan should note whether `fetchSector` resilience is deferred to a future phase or intentionally left out.
