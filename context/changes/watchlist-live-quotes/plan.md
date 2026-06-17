# WatchlistPanel: Replace Mocked Quotes with Live Finnhub Data — Implementation Plan

## Overview

Replace the client-side `MOCK_QUOTES` table and random `fetchQuote()` in `WatchlistPanel.tsx` with real Finnhub market data, served through a new server-side batch API endpoint (`GET /api/watchlist/quotes`). The endpoint reuses the existing Supabase daily price cache — extended to carry full OHLC fields — and the existing 7-day sector cache — extended to carry company names — so that portfolio/watchlist ticker overlap costs zero extra Finnhub calls and the free-tier rate limit (60 req/min) is never a concern.

## Current State Analysis

- **`WatchlistPanel.tsx` is fully client-side** (`src/components/portfolio/WatchlistPanel.tsx:65`), accepts no props, and is rendered in `DashboardView.tsx:592` when `activeTab === "all"`. It persists the **entire `WatchItem[]` including prices** to `localStorage` (`:89-91`) — a latent staleness bug once data is live.
- **Mock data lives in two places**: the `MOCK_QUOTES` table (`:18-29`) and the local random-generating `fetchQuote()` (`:34-53`). Both must go.
- **`fetchQuote()` in `src/lib/finnhub.ts:34-64`** already receives the full Finnhub `/quote` response (`c, d, dp, h, l, o, pc`) but extracts only `c` and `dp`. The remaining fields are available at zero extra call cost.
- **`fetchSector()` in `src/lib/finnhub.ts:3-32`** calls `/stock/profile2`, which also returns `name`, but discards it.
- **Price cache** (`src/lib/prices.ts`, `refreshPricesForTickers`) stores only `price` + `change_pct` on a same-day TTL, with `p-limit(10)` and `Promise.allSettled` resilience. `PriceData` (`src/lib/portfolio.ts:3-8`) has `price, fetched_at, is_fresh, changePct`.
- **Sector refresh is inlined** in `dashboard.astro:35-66` (not extracted), on a 7-day TTL with the same cache-then-fetch pattern.
- **API conventions** (`src/pages/api/portfolios/index.ts`): `APIRoute` handlers, auth via `context.locals.user` (401 if absent), `createClient(headers, cookies)` (500 if null), `{ data }` / `{ error }` JSON bodies with explicit status codes.
- **No client data library** (no React Query/SWR); the panel must `fetch()` and manage its own loading/error state. It already imports `Loader2` (used on the add button).
- **Test pattern**: `src/lib/finnhub.test.ts` mocks `astro:env/server` via `vi.mock` with a lazy getter and stubs `global.fetch`. `prices.integration.test.ts` exists. Scripts: `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`.

## Desired End State

Opening the dashboard "All" tab shows the watchlist populated with **live** prices, day change, % change, day range, and previous close for the default tickers (AAPL, NVDA, MSFT, TSLA) and any user-added symbol. Quotes load via a skeleton state, reflect real Finnhub data, and a bad/unknown ticker fails gracefully without blanking the rest of the list. No mock data remains anywhere. Typical page loads make 0–3 extra Finnhub calls; worst case stays well under 60/min.

### Key Discoveries:

- Finnhub `/quote` returns all needed OHLC fields in one call — `fetchQuote` discards `d,h,l,o,pc` (`finnhub.ts:52-56`).
- `/stock/profile2` returns `name` alongside `finnhubIndustry` — `fetchSector` discards it (`finnhub.ts:21-22`).
- Portfolio tickers are pre-warmed into `prices` on every SSR load (`dashboard.astro:30`); watchlist overlap is free.
- `localStorage` currently stores full quote objects (`WatchlistPanel.tsx:69`) — must migrate to tickers-only to avoid rendering stale prices.

## What We're NOT Doing

- No intraday auto-refresh / polling — quotes refresh on mount and on add only (the cache is same-day TTL, so polling returns identical data).
- No manual refresh button.
- No new `profiles` table or `watchlist_quotes` table — names ride on `sectors`, OHLC rides on `prices`.
- No change to the dashboard's sector-allocation chart behavior (the extracted helper must preserve current output).
- No removal of the company-name line in the UI (we keep `WatchItem.name`).
- No client-side data library introduction.
- No anonymous access — the endpoint requires auth, consistent with existing `prices` RLS.

## Implementation Approach

Three phases, bottom-up: (1) widen the data layer (migration + Finnhub extraction + cache helpers) so OHLC and names are cached at zero extra call cost; (2) add the batch endpoint that composes those helpers; (3) rewrite the panel to consume the endpoint with proper persistence and loading/error UX. Each phase is independently verifiable.

## Critical Implementation Details

- **Cache resilience contract**: the watchlist endpoint must follow the existing `Promise.allSettled` + `p-limit(10)` pattern so one failing ticker never rejects the batch. Failed tickers are omitted from the response map; the client renders a per-row error/placeholder for any requested ticker absent from the response.
- **localStorage migration**: old entries are `WatchItem[]` (objects with prices); new format is `string[]` (tickers). The panel's reader must detect the old shape and map `.ticker` out of it rather than throwing or rendering stale objects.
- **`fetchSector` signature change is load-bearing**: `dashboard.astro` is the only caller and is being refactored in the same phase — change the return shape and the caller together to keep typecheck green.

## Phase 1: Data Layer — Extend Finnhub Fetch & Caches

### Overview

Add OHLC columns to `prices` and a `name` column to `sectors`; teach `fetchQuote` to return full OHLC and `fetchSector`/profile to return the company name; extend `PriceData` + `refreshPricesForTickers`; extract the inlined sector refresh into a reusable `src/lib/sectors.ts` that also captures names. After this phase the caches carry everything the watchlist needs, but no consumer reads the new fields yet (except the dashboard, unchanged in behavior).

### Changes Required:

#### 1. Migration — extend prices and sectors

**File**: `supabase/migrations/20260617120000_add_ohlc_and_name.sql` (new)

**Intent**: Add the OHLC/absolute-change columns the watchlist needs to `prices`, and a company-name column to `sectors`, so both can be cached without extra Finnhub calls.

**Contract**: `ALTER TABLE public.prices ADD COLUMN change_abs NUMERIC(8,4), high NUMERIC(15,4), low NUMERIC(15,4), open NUMERIC(15,4), prev_close NUMERIC(15,4)` (all nullable — existing rows backfill on next refresh). `ALTER TABLE public.sectors ADD COLUMN name TEXT` (nullable). No RLS changes (existing policies cover all columns).

#### 2. Extend `fetchQuote` to return full OHLC

**File**: `src/lib/finnhub.ts`

**Intent**: Stop discarding `d,h,l,o,pc`; return them alongside `price` and `changePct`. Preserve the `c === 0 → null` guard, the 2.5s timeout, and null-on-error behavior.

**Contract**: Return type becomes `{ price: number; changePct: number | null; changeAbs: number | null; high: number | null; low: number | null; open: number | null; prevClose: number | null } | null`. Map Finnhub `d→changeAbs, h→high, l→low, o→open, pc→prevClose`, each guarded as a finite number or `null` (mirroring the existing `dp` guard).

#### 3. Change `fetchSector` to also return the company name

**File**: `src/lib/finnhub.ts`

**Intent**: `/stock/profile2` already returns `name`; capture it so sector refresh can cache it. Rename to reflect it now returns a profile.

**Contract**: Rename `fetchSector` → `fetchProfile`, return `{ sector: string | null; name: string | null } | null` (null only on request failure; individual fields null when absent/blank). The only caller is `dashboard.astro` (refactored in change #5).

#### 4. Extend `PriceData` and the price cache to carry OHLC

**File**: `src/lib/portfolio.ts` (interface) and `src/lib/prices.ts` (read/upsert)

**Intent**: Thread the new fields through the cache so cached watchlist tickers return full OHLC with no Finnhub call. Additive only — `computePositions` and dashboard consumers ignore the new fields.

**Contract**: `PriceData` gains `changeAbs: number | null; high: number | null; low: number | null; open: number | null; prevClose: number | null`. `refreshPricesForTickers` selects the new columns, includes them in the `cacheMap`, upserts them from the `fetchQuote` result, and populates them in every returned `PriceData` (cached, fresh, and stale-fallback branches).

#### 5. Extract reusable sector+name refresh into `src/lib/sectors.ts`

**File**: `src/lib/sectors.ts` (new) and `src/pages/dashboard.astro` (consume)

**Intent**: Move the inlined sector-refresh loop out of `dashboard.astro` into a reusable helper that also caches `name`, so the watchlist endpoint can reuse it. Dashboard output (the `sectors` string map) must be unchanged.

**Contract**: Export `refreshSectorsForTickers(tickers: string[], supabase: SupabaseClient): Promise<Record<string, { sector: string | null; name: string | null }>>`. Preserve the 7-day TTL, `p-limit(10)`, `Promise.allSettled`, cache-read-then-`fetchProfile`-then-upsert flow, and the stale-fallback branch. Upsert now includes `name`. `dashboard.astro` replaces its inline block (`:32-66`) with a call to this helper and derives its existing `sectors: Record<string,string>` map from the result (`.sector ?? "Other"` handling unchanged).

#### 6. Update affected unit tests

**File**: `src/lib/finnhub.test.ts`

**Intent**: Existing `fetchQuote` assertions expect `{ price, changePct }` exactly — update to the new shape and add coverage for OHLC extraction and missing-field nulls.

**Contract**: Update `toEqual` expectations to include the five new fields; add a case asserting `d/h/l/o/pc` map through and a case asserting absent fields become `null`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests pass: `npm run test`
- Build succeeds: `npm run build`

#### Manual Verification:

- Migration applies cleanly against local Supabase; `prices` and `sectors` show the new columns.
- Dashboard still renders the sector-allocation chart identically (no regression from the extraction).
- After a dashboard load, a `prices` row for a portfolio ticker shows populated `high/low/open/prev_close/change_abs`, and its `sectors` row shows a populated `name`.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Watchlist Quotes API Endpoint

### Overview

Add a batched, auth-required, partial-failure-tolerant `GET /api/watchlist/quotes` endpoint that composes the Phase 1 helpers to return live quotes + company names for an arbitrary list of tickers.

### Changes Required:

#### 1. New endpoint

**File**: `src/pages/api/watchlist/quotes.ts` (new)

**Intent**: Bridge the client panel to the server-only Finnhub/cache layer. Parse the requested tickers, refresh prices (OHLC) and profiles (names) via the Phase 1 helpers, and return a per-ticker result map, omitting tickers that failed to resolve.

**Contract**: `export const GET: APIRoute`. Follow the `portfolios/index.ts` shape: 401 if no `context.locals.user`; `createClient(headers, cookies)`, 500 if null. Read `tickers` from the query string (comma-separated), uppercased, de-duplicated, trimmed, capped (e.g. ≤ 25) and `400` on empty/invalid. Call `refreshPricesForTickers(tickers, supabase)` and `refreshSectorsForTickers(tickers, supabase)`, then assemble `{ data: Record<ticker, { ticker, name, c, d, dp, h, l, o, pc }> }`. A ticker with no usable price (absent from the prices result) is omitted from `data`. `name` falls back to the ticker symbol when null. Response `{ data }` with status 200, `JSON_HEADERS`.

#### 2. Endpoint unit/integration test

**File**: `src/test/integration/watchlist-quotes.integration.test.ts` (new) — or a unit test mirroring the `finnhub.test.ts` mocking approach, whichever matches the established pattern for `src/pages/api` routes.

**Intent**: Verify auth gating (401), input validation (400 on empty), batch success shape, and partial-failure tolerance (one bad ticker omitted, others returned).

**Contract**: Assert 401 without user; 400 for empty `tickers`; a 200 response whose `data` map keys match the resolvable tickers and whose values carry all of `c,d,dp,h,l,o,pc,name`; and that an unresolvable ticker is absent while siblings remain.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests pass: `npm run test`
- Integration tests pass (if endpoint test placed there): `npm run test:integration`

#### Manual Verification:

- `curl`-ing the endpoint while authenticated returns live quotes for `AAPL,NVDA`; an unauthenticated request returns 401.
- A request including a bogus symbol (e.g. `ZZZZ`) returns the valid tickers and silently omits the bogus one.
- Repeated requests within the same day make no additional Finnhub calls (served from cache).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: WatchlistPanel Rewrite

### Overview

Remove all mock data, migrate persistence to tickers-only, fetch live quotes from the new endpoint on mount and on add, and add skeleton loading + per-ticker error handling.

### Changes Required:

#### 1. Remove mock data and rewire data fetching

**File**: `src/components/portfolio/WatchlistPanel.tsx`

**Intent**: Delete `MOCK_QUOTES` (`:18-29`) and the local mock `fetchQuote` (`:34-53`). Fetch real quotes from the endpoint: a batch fetch for all tickers on mount, and a single-ticker fetch when one is added.

**Contract**: Component still renders `WatchItem` rows. On mount, read the persisted ticker list, then `GET /api/watchlist/quotes?tickers=…` and populate `items`. `addTicker` posts the new symbol to the same endpoint (single-ticker batch), appends on success, and surfaces an error if the symbol fails to resolve. Default tickers remain `["AAPL","NVDA","MSFT","TSLA"]` when nothing is persisted.

#### 2. Migrate localStorage to tickers + order only

**File**: `src/components/portfolio/WatchlistPanel.tsx`

**Intent**: Persist only the ordered ticker list so stale prices can never render; tolerate the legacy `WatchItem[]` shape on read.

**Contract**: Persisted value becomes `string[]` under the existing `pholio_watchlist` key. The reader detects legacy entries (array of objects) and maps each `.ticker` out; the writer (`useEffect` on `items`) serializes `items.map(i => i.ticker)`. Reordering (drag) and removal continue to update this list.

#### 3. Skeleton loading and per-ticker error UX

**File**: `src/components/portfolio/WatchlistPanel.tsx` (+ CSS where watchlist styles live)

**Intent**: Show skeleton rows matching the grid layout during the initial fetch (no layout jump), and render a placeholder/error indicator for any requested ticker the endpoint omitted.

**Contract**: While the initial batch fetch is in flight, render N skeleton rows using the existing `COL_TEMPLATE` grid. For a ticker absent from the response, render its row with the symbol and an inline "unavailable" indicator rather than dropping it silently or showing zeros. The add-button spinner (`Loader2`) behavior is preserved.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests pass: `npm run test`
- Build succeeds: `npm run build`
- No references to `MOCK_QUOTES` remain: `! grep -rn "MOCK_QUOTES" src/`

#### Manual Verification:

- Loading the "All" tab shows skeleton rows, then live prices for the four default tickers.
- Adding a real ticker (e.g. `AMD`) fetches and appends it with live data; adding a bogus one shows an error and does not append.
- Reloading the page preserves the ticker list and order but re-fetches fresh quotes (no stale prices from localStorage).
- Day-range bar, % pill colors, and prev-close render correctly from live data.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation.

---

## Testing Strategy

### Unit Tests:

- `fetchQuote`: OHLC fields mapped through; absent fields → `null`; `c === 0` → `null` (existing); timeout/error → `null` (existing).
- `fetchProfile`: returns `{ sector, name }`; blank/absent fields → `null`.
- Endpoint: auth gate, input validation, batch shape, partial-failure omission.

### Integration Tests:

- `watchlist-quotes` endpoint against the integration harness (auth + cache behavior), mirroring `prices.integration.test.ts`.

### Manual Testing Steps:

1. Apply the migration; load the dashboard; confirm sector chart unchanged and new columns populated.
2. Open "All" tab; confirm skeleton → live quotes for defaults.
3. Add `AMD` (resolves) and `ZZZZ` (fails) — verify append vs error.
4. Reload; confirm tickers/order persist and quotes re-fetch fresh.
5. Confirm no extra Finnhub calls on same-day repeated loads (cache hit).

## Performance Considerations

Steady-state 0–3 extra Finnhub calls per load for a typical user (portfolio/watchlist overlap served from cache); worst case (10 disjoint cold tickers) ≈ 10 calls, well under 60/min. `p-limit(10)` caps concurrency on both refresh helpers.

## Migration Notes

- New SQL migration is additive and nullable — safe on existing data; columns backfill on next refresh.
- localStorage legacy `WatchItem[]` values are handled on read (mapped to tickers); no user action needed.

## References

- Research: `context/changes/watchlist-live-quotes/research.md`
- Change identity: `context/changes/watchlist-live-quotes/change.md`
- Endpoint pattern: `src/pages/api/portfolios/index.ts`
- Cache pattern: `src/lib/prices.ts:6-68`
- Sector refresh (to extract): `src/pages/dashboard.astro:32-66`
- Test pattern: `src/lib/finnhub.test.ts`
- Prior art: `context/archive/2026-06-09-portfolio-roi-view/plan.md`, `context/archive/2026-06-10-sector-allocation-chart/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data Layer — Extend Finnhub Fetch & Caches

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — 425f308
- [x] 1.2 Linting passes: `npm run lint` — 425f308
- [x] 1.3 Unit tests pass: `npm run test` — 425f308
- [x] 1.4 Build succeeds: `npm run build` — 425f308

#### Manual

- [x] 1.5 Migration applies cleanly; new columns present on `prices` and `sectors` — 425f308
- [x] 1.6 Dashboard sector-allocation chart renders identically (no regression) — 425f308
- [x] 1.7 Portfolio ticker row shows populated OHLC + sector `name` after a load — 425f308

### Phase 2: Watchlist Quotes API Endpoint

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — b1415db
- [x] 2.2 Linting passes: `npm run lint` — b1415db
- [x] 2.3 Unit tests pass: `npm run test` — b1415db
- [x] 2.4 Integration tests pass: `npm run test:integration` — b1415db

#### Manual

- [x] 2.5 Authenticated `curl` returns live quotes; unauthenticated returns 401
- [x] 2.6 Bogus symbol omitted while valid tickers return
- [x] 2.7 Same-day repeated requests make no extra Finnhub calls

### Phase 3: WatchlistPanel Rewrite

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck`
- [x] 3.2 Linting passes: `npm run lint`
- [x] 3.3 Unit tests pass: `npm run test`
- [x] 3.4 Build succeeds: `npm run build`
- [x] 3.5 No `MOCK_QUOTES` references remain: `! grep -rn "MOCK_QUOTES" src/`

#### Manual

- [ ] 3.6 "All" tab shows skeleton then live quotes for defaults
- [ ] 3.7 Adding a real ticker appends with live data; bogus ticker errors
- [ ] 3.8 Reload preserves tickers/order but re-fetches fresh quotes
- [ ] 3.9 Day-range bar, % pill colors, prev-close render correctly
