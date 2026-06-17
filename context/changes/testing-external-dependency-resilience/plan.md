# External Dependency Resilience Tests (Phase 3) Implementation Plan

## Overview

Phase 3 of the test-plan rollout protects **Risk #5**: a Finnhub outage must
neither crash the dashboard nor silently mislead the user. Today the entire
fetch-and-fallback cascade is inline in the `dashboard.astro` server
frontmatter, so there is no seam an integration test can call. This plan first
**extracts** that cascade into a testable module (`src/lib/prices.ts`), then
adds a focused resilience test matrix: one unit case proving the
`AbortController` timeout actually fires, and two integration cases proving the
cache fallback fires against real local Supabase. It closes by filling in the
test-plan cookbook (§6.3) and reconciling stale wording in the test plan.

## Current State Analysis

- **`fetchQuote` is already hardened** (`src/lib/finnhub.ts:34–63`). It never
  throws; every failure mode (missing key, non-2xx, bad JSON, `c === 0`,
  AbortError on timeout) returns `null`. Phase 1 (`src/lib/finnhub.test.ts`)
  already covers 5xx, `c:0`, falsy `c`, missing key, and `fetch` throwing — but
  **not** the `AbortController` 2500ms timeout path, and not the cache cascade.
- **The cascade is inline and untestable** (`src/pages/dashboard.astro:33–64`):
  `SELECT * FROM prices WHERE ticker IN (...)` → build `cacheMap` →
  `pLimit(10)` + `Promise.allSettled` over tickers → today-freshness
  short-circuit → `fetchQuote` → on success `upsert` + `is_fresh:true`; on
  `null` with a cached row `is_fresh:false` (stale reuse); on `null` with no
  cached row the ticker is **omitted** from the `prices` dict entirely. There is
  no `try/catch` around `fetchQuote` — the caller relies on the null contract.
- **The only machine-readable fallback signal is `is_fresh`**
  (`src/lib/portfolio.ts:3–7`) plus ticker presence/absence. Downstream,
  `computePositions` (`src/lib/portfolio.ts:117–124`) maps an absent ticker to
  `currentPrice: null` and `isFresh: false`. The fallback does not throw, does
  not return an error type, and does not change the price value — `is_fresh` is
  the load-bearing observable.
- **Integration harness is plain Node**, established in Phase 2: `vitest.integration.config.ts`
  (node env, `.env.test` via `loadEnv`, `@`/`astro:env/server`/`astro:middleware`
  aliases), `src/test/integration/setup.ts` (fast-fail health check), run via
  `npm run test:integration`. `finnhub.test.ts` already proves the
  `vi.mock("astro:env/server")` getter + `global.fetch` mock pattern.
- **`prices` table is global** (`supabase/migrations/20260609000000_create_prices.sql`):
  `ticker TEXT PRIMARY KEY`, `price NUMERIC(15,4) CHECK (price > 0)`,
  `fetched_at TIMESTAMPTZ`. No `user_id` — so no two-user fixture is needed; a
  single seeded row (via the service-role client) suffices.

## Desired End State

- `src/lib/prices.ts` exports `refreshPricesForTickers(tickers, supabase)`
  returning `Record<string, PriceData>`, behaviorally identical to the old
  inline cascade. `dashboard.astro` imports and calls it; no user-visible change.
- `src/lib/finnhub.test.ts` has a new case proving the 2500ms `AbortController`
  timeout returns `null` (via `vi.useFakeTimers()`, no real latency).
- `src/test/integration/prices.integration.test.ts` proves, against real local
  Supabase with a mocked `global.fetch`:
  1. Finnhub failure (5xx/null) **with** a stale cached row → `is_fresh:false`,
     cached price reused, and the Supabase row is **unchanged**.
  2. Finnhub failure **with no** cached row → ticker omitted from the result,
     no throw, no bogus row written; `computePositions` yields `currentPrice:null`.
- Test-plan §6.3 is filled in; §4 stack note and Risk #5 wording are reconciled
  with reality; §3 Phase 3 row → `complete`; §5 Finnhub-fallback gate noted.

**Verification:** `npm test`, `npm run test:integration`, `npm run typecheck`,
`npm run lint`, and `npm run build` all pass; dashboard still renders prices.

### Key Discoveries:

- `src/pages/dashboard.astro:33–64` — the full cascade to extract (verbatim move).
- `src/lib/finnhub.ts:37–40` — `AbortController` + `setTimeout(2500)`; the abort
  lands in the `catch` at `:56–59` → `null`. This is the untested path.
- `src/lib/portfolio.ts:117–124` — `computePositions` maps absent ticker →
  `currentPrice:null`, `isFresh:false`; this is the data-layer assertion target.
- `src/test/stubs/astro-env-server.ts:5` — `FINNHUB_API_KEY = "test-key"` already
  present; its own comment anticipates "Phase 3 tests override this via vi.mock
  factory (getter pattern)" — matching the existing `finnhub.test.ts` approach.
- `src/test/integration/helpers/users.ts:39` — pattern for building a
  service-role admin client from `process.env.SUPABASE_SERVICE_ROLE_KEY`; reuse
  this shape to seed/clean a single `prices` row (no two-user fixture needed).
- `p-limit@^7.3.0` is a direct dependency (`package.json`); `undici` is not a
  direct dep (Node built-in) — we will **not** use `undici` MockAgent.

## What We're NOT Doing

- **No UI change.** Per the UI-signal decision, the existing gray-text (`#93a1b5`)
  stale signal and em-dash (`"—"`) no-price signal are accepted as satisfying
  Risk #5. We do **not** add a ⚠ icon or the literal string "brak danych". Tests
  assert on the data-layer signal (`is_fresh` / `currentPrice: null`), not pixels.
- **No `fetchSector` extraction.** The sector cascade (`dashboard.astro:66–100`)
  is structurally identical but is not a tracked risk; it stays inline. A future
  sector-resilience phase can extract it.
- **No rendering / React-component tests.** Per test-plan §7 (no UI snapshot
  tests) and the assert-layer decision, we assert at `refreshPricesForTickers`
  - `computePositions`, not by rendering `PortfolioSection`.
- **No dedicated happy-path write-through or freshness-short-circuit test.**
  De-scoped per the cache-integrity selection. The stale-row scenario is set up
  by seeding directly via the service-role client, not by exercising the success
  branch.
- **No `@cloudflare/vitest-pool-workers` / Workers-runtime integration.** The
  harness is plain Node (Phase 2 reality). We reconcile the test-plan §4 wording
  rather than adopt the Workers pool.
- **No CI wiring.** That is Phase 4 (Quality gates wiring).

## Implementation Approach

The phase is gated on a low-risk extraction: move the inline cascade into a pure
function so a test can call it directly. The function takes the Supabase client
as a parameter (dependency injection) so tests pass a real anon-or-service
client while production passes the request-scoped SSR client. Finnhub is mocked
at the `global.fetch` boundary (which `fetchQuote` calls internally) using
`vi.spyOn(global, "fetch")` — consistent with `finnhub.test.ts` and avoiding the
`undici` surface. The timeout proof is deliberately split into a unit test with
fake timers so fake timers never interfere with real Supabase I/O.

## Critical Implementation Details

- **Fake timers must not touch real Supabase.** `vi.useFakeTimers()` patches the
  global timer/`setTimeout` that Supabase's own `fetch`/retry logic may rely on.
  This is why the timeout proof lives in `finnhub.test.ts` (mocked fetch, no
  Supabase) and the integration cases use a mocked fetch that resolves/rejects
  immediately (5xx or thrown error) — never the never-resolving + advance-timers
  technique inside an integration file.
- **Behavior parity is the extraction's only contract.** The move must preserve:
  the `pLimit(10)` concurrency, `Promise.allSettled` (one failed ticker must not
  abort others), the date-only freshness comparison (`fetched_at.split("T")[0]
=== today`), the swallowed-but-logged upsert error, and the exact omit-on-null-
  with-no-cache behavior. No logic change.
- **`global.fetch` spy must be restored.** Mirror `finnhub.test.ts`: reset/restore
  the spy in `afterEach` so a leaked mock cannot poison Supabase's own fetch
  calls in later tests.

## Phase 1: Extract the Price Cascade

### Overview

Move the inline price fetch-and-cache cascade out of the Astro frontmatter into
an importable, testable function. Pure refactor — no behavior change.

### Changes Required:

#### 1. New price-cascade module

**File**: `src/lib/prices.ts` (new)

**Intent**: Encapsulate exactly the logic at `dashboard.astro:33–64` so it can be
imported by both the dashboard and tests. Takes the tickers and a Supabase client;
returns the `prices` dict.

**Contract**:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriceData } from "@/lib/portfolio";

export async function refreshPricesForTickers(
  tickers: string[],
  supabase: SupabaseClient,
): Promise<Record<string, PriceData>>;
```

Body is the verbatim cascade: SELECT cached rows → build `cacheMap` →
`pLimit(10)` + `Promise.allSettled` → today-freshness short-circuit →
`fetchQuote` → upsert + `is_fresh:true` on success / `is_fresh:false` stale reuse
/ omit on null-with-no-cache. Compute `today` inside the function. Imports
`fetchQuote` from `@/lib/finnhub`. The empty-tickers guard (return `{}`) moves
in too. Use double quotes (lessons.md).

#### 2. Rewire the dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the inline price cascade (lines 33–64) with a call to
`refreshPricesForTickers`. Leave the sector cascade (66–100) untouched.

**Contract**: Add `import { refreshPricesForTickers } from "@/lib/prices";`.
Replace the `if (supabase && uniqueTickers.length > 0) { ... }` price block with
`const prices = supabase ? await refreshPricesForTickers(uniqueTickers, supabase) : {};`
(preserving the existing `const prices: Record<string, PriceData> = {}` default
when there is no client). Drop the now-unused `fetchQuote` import from
`dashboard.astro` (keep `fetchSector`).

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Existing unit + integration suites still green: `npm test` and `npm run test:integration`

#### Manual Verification:

- [ ] Dashboard loads and renders current prices identically to before (fresh prices, stale gray text, em-dash for no price) — confirm via `npm run dev`.

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation that the dashboard renders
correctly before proceeding to Phase 2.

---

## Phase 2: Resilience Test Matrix

### Overview

Add the tests that prove Risk #5: the `AbortController` timeout fires (unit) and
the cache fallback fires against real Supabase (integration).

### Changes Required:

#### 1. Timeout proof (unit)

**File**: `src/lib/finnhub.test.ts`

**Intent**: Prove the 2500ms `AbortController` timeout (`finnhub.ts:37–40`)
actually aborts the fetch and returns `null`, without real latency.

**Contract**: Add one `it(...)` to the existing `describe("fetchQuote")`. Mock
`global.fetch` to return a never-resolving `Promise`; use `vi.useFakeTimers()`,
call `fetchQuote("AAPL")` (don't await yet), advance with
`vi.advanceTimersByTime(2500)` so the abort fires, then await and assert the
result is `null`. Restore real timers in the test (or `afterEach`). Reuse the
file's existing `vi.mock("astro:env/server")` getter and `global.fetch` mock.

#### 2. Cache-fallback integration tests

**File**: `src/test/integration/prices.integration.test.ts` (new)

**Intent**: Prove the extracted cascade falls back correctly when Finnhub fails,
against real local Supabase, with `global.fetch` mocked to simulate the outage.

**Contract**: Two cases under one `describe("Risk #5 — Finnhub outage fallback")`.
Use a service-role admin client (built like `helpers/users.ts:39` from
`process.env.SUPABASE_SERVICE_ROLE_KEY`) to seed and clean `prices` rows; use a
unique ticker per run (e.g. `TST<timestamp>`) to avoid collisions on the global
table. Mock Finnhub via `vi.spyOn(global, "fetch")` returning `{ ok: false }`
(5xx) or a rejected promise; restore in `afterEach`. **Do not** use fake timers
in this file.

- **(a) Stale-cache fallback**: seed a `prices` row for the ticker with a
  `fetched_at` of a prior day (so freshness short-circuit does not fire) and a
  known price. Call `refreshPricesForTickers([ticker], adminClient)` with Finnhub
  mocked to fail. Assert: result `[ticker].is_fresh === false` and `.price ===`
  the seeded price; re-`SELECT` the row from Supabase and assert it is
  **unchanged** (same price, same `fetched_at`). Feed the result through
  `computePositions` with a one-transaction fixture and assert `isFresh:false`,
  `currentPrice ===` seeded price.
- **(b) No-cache fallback**: ensure no `prices` row exists for the ticker. Call
  `refreshPricesForTickers([ticker], adminClient)` with Finnhub mocked to fail.
  Assert: it does not throw; the ticker is **absent** from the result; re-`SELECT`
  confirms **no row** was written. Feed an empty/omitted price dict through
  `computePositions` and assert `currentPrice: null`, `isFresh: false` (the
  data-layer "brak danych" signal).

**Teardown**: delete the seeded row(s) in `afterAll`/`afterEach` via the admin
client so reruns are clean.

### Success Criteria:

#### Automated Verification:

- [ ] Unit suite passes including the new timeout case: `npm test`
- [ ] Integration suite passes (local Supabase running): `npm run test:integration`
- [ ] Linting passes: `npm run lint`
- [ ] Type checking passes: `npm run typecheck`

#### Manual Verification:

- [ ] Temporarily force `fetchQuote` to fail (or set an invalid `FINNHUB_API_KEY`) and confirm the live dashboard shows the stale/no-price signal without a crash, matching the tested behavior.

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Cookbook + Close-out

### Overview

Fill in the test-plan cookbook for the external-HTTP pattern, reconcile stale
wording, and flip the rollout status.

### Changes Required:

#### 1. Fill in cookbook §6.3

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.3 "TBD" placeholder with the real external-HTTP
dependency pattern established here.

**Contract**: Document: file location (`src/test/integration/*.integration.test.ts`),
the `vi.spyOn(global, "fetch")` mock pattern (and why not `undici` MockAgent),
the single-seeded-row approach for the global `prices` table via the service-role
client, the **split rule** (timeout/AbortController proof goes in a unit test with
fake timers; cache-fallback goes in integration with immediately-resolving mocks),
the load-bearing assertion (`is_fresh:false` + ticker presence/absence, fed
through `computePositions`), and the run command `npm run test:integration`.
Reference `src/test/integration/prices.integration.test.ts` and the timeout case
in `src/lib/finnhub.test.ts`.

#### 2. Reconcile stale test-plan wording

**File**: `context/foundation/test-plan.md`

**Intent**: Bring §4 and the Risk #5 wording in line with the implemented reality
so future readers are not misled.

**Contract**: In §4, note the integration layer runs in **plain Node** with
`vi.spyOn(global, "fetch")` (not `@cloudflare/vitest-pool-workers` / Workers
runtime / `undici` MockAgent — those rows were aspirational; Phase 2/3 reality is
plain Node). Add a one-line note (near Risk #5 or §6.3) that the ⚠/"brak danych"
wording is satisfied by the existing gray-text + em-dash + `is_fresh` data signal;
no explicit ⚠ icon or literal string was added.

#### 3. Flip rollout status and gate

**File**: `context/foundation/test-plan.md`

**Intent**: Mark Phase 3 complete and record the Finnhub-fallback gate as active.

**Contract**: §3 Phase 3 row Status → `complete`. §5 "Finnhub fallback test" row:
note it is satisfied locally (`npm run test:integration`); CI enforcement remains
"required after §3 Phase 4". Update the header "Last updated" line.

#### 4. Stamp the change

**File**: `context/changes/testing-external-dependency-resilience/change.md`

**Intent**: Close the change.

**Contract**: `status: complete`, `updated: <today>`.

### Success Criteria:

#### Automated Verification:

- [ ] §6.3 no longer contains "TBD"; grep: `! grep -q "TBD — see §3 Phase 3" context/foundation/test-plan.md`
- [ ] Full suite still green: `npm test` and `npm run test:integration`

#### Manual Verification:

- [ ] §6.3 reads as a usable recipe for the next external-HTTP test author.
- [ ] §4 / Risk #5 wording no longer contradicts the implemented harness.

**Implementation Note**: After this phase, the rollout advances to Phase 4
(Quality gates wiring) — out of scope here.

---

## Testing Strategy

### Unit Tests:

- New `fetchQuote` timeout case in `src/lib/finnhub.test.ts`: never-resolving
  `fetch` + `vi.useFakeTimers()` + advance 2500ms → `null`. Proves the
  `AbortController` path, not just the generic null contract.

### Integration Tests:

- `src/test/integration/prices.integration.test.ts`:
  - Stale-cache fallback: seeded prior-day row + mocked Finnhub failure →
    `is_fresh:false`, cached price reused, Supabase row unchanged.
  - No-cache fallback: no seeded row + mocked Finnhub failure → ticker omitted,
    no throw, no row written; `computePositions` → `currentPrice:null`.

### Manual Testing Steps:

1. `npm run dev`, load the dashboard, confirm prices render as before (Phase 1).
2. Force a Finnhub failure (invalid key) and confirm stale/no-price signals
   render without a crash (Phase 2).

## Performance Considerations

None. The extraction preserves `pLimit(10)` concurrency and adds no new I/O. Tests
use immediately-resolving mocks (integration) and fake timers (unit) — no real
2.5s waits.

## Migration Notes

No schema or data migration. The `prices` table is unchanged. Tests seed and
clean their own rows on the global table using unique per-run tickers.

## References

- Research: `context/changes/testing-external-dependency-resilience/research.md`
- Test plan: `context/foundation/test-plan.md` (§2 Risk #5, §3 Phase 3, §6.3)
- Cascade to extract: `src/pages/dashboard.astro:33–64`
- Client under test: `src/lib/finnhub.ts:34–63`
- Data signal: `src/lib/portfolio.ts:117–124` (`computePositions`)
- Reference unit pattern: `src/lib/finnhub.test.ts`
- Reference integration patterns: `src/test/integration/helpers/users.ts:39`,
  `src/test/integration/unauthenticated-api.integration.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extract the Price Cascade

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — a3bdf5d
- [x] 1.2 Linting passes: `npm run lint` — a3bdf5d
- [x] 1.3 Build succeeds: `npm run build` — a3bdf5d
- [x] 1.4 Existing unit + integration suites still green: `npm test` and `npm run test:integration` — a3bdf5d

#### Manual

- [x] 1.5 Dashboard renders prices identically to before via `npm run dev` — a3bdf5d

### Phase 2: Resilience Test Matrix

#### Automated

- [x] 2.1 Unit suite passes including the new timeout case: `npm test` — 298bd5c
- [x] 2.2 Integration suite passes (local Supabase running): `npm run test:integration` — 298bd5c
- [x] 2.3 Linting passes: `npm run lint` — 298bd5c
- [x] 2.4 Type checking passes: `npm run typecheck` — 298bd5c

#### Manual

- [x] 2.5 Forced Finnhub failure shows stale/no-price signal without a crash on the live dashboard — 298bd5c

### Phase 3: Cookbook + Close-out

#### Automated

- [x] 3.1 §6.3 no longer contains "TBD" (grep check) — ba0e41b
- [x] 3.2 Full suite still green: `npm test` and `npm run test:integration` — ba0e41b

#### Manual

- [x] 3.3 §6.3 reads as a usable recipe for the next external-HTTP test author — ba0e41b
- [x] 3.4 §4 / Risk #5 wording no longer contradicts the implemented harness — ba0e41b
