# Portfolio ROI View — Implementation Plan

## Overview

Implement S-03: the portfolio table showing each position's current EOD price (Finnhub) and ROI (% and absolute). Transactions are aggregated per-ticker into positions with weighted average cost. Prices are cached in a new `prices` Supabase table and served as stale fallback when Finnhub is unavailable. This is the North Star feature — the first slice that closes the full loop: transaction wpisana → cena pobrana → zysk widoczny.

## Current State Analysis

- `src/pages/dashboard.astro` fetches user transactions server-side and passes them to `DashboardView` as `initialTransactions`
- `src/components/transactions/DashboardView.tsx` renders a 5-column table (Ticker, Shares, Purchase Price, Currency, Date) — one row per transaction
- `src/types/transaction.ts` defines `Transaction` (purchase data only — no current price or ROI fields)
- No price-fetching infrastructure exists anywhere in the codebase
- `src/lib/supabase.ts` — `createClient()` returns a user-authenticated Supabase client (anon key + session cookies); null-check required before every call
- `astro.config.mjs` declares `SUPABASE_URL` and `SUPABASE_KEY` via `astro:env/server`; `FINNHUB_API_KEY` not yet declared
- Finnhub decided as EOD provider (60 req/min free tier, clean JSON, Cloudflare Workers compatible) — `context/foundation/eod-api-decision.md`

## Desired End State

Logged-in user opens the dashboard and sees a 7-column portfolio table — one row per ticker — showing: total shares, weighted average purchase price, current EOD price, total position value, ROI % and ROI absolute value. When Finnhub is unavailable or slow, the last cached price is shown with a ⚠ indicator and its date. New transactions added via the existing modal are immediately reflected in the aggregated view using the server-fetched prices.

### Verify:
1. `npx astro check` passes with zero type errors
2. `npm run lint` passes
3. Logged-in user with transactions sees the 7-column portfolio table with prices and ROI
4. ROI is mathematically correct: `(current_price - avg_cost) / avg_cost × 100%`
5. When Finnhub is unreachable (network mocked off), cached prices are shown with ⚠ indicator
6. Adding a new transaction via modal updates the aggregated row (or creates a new one) without page reload, using the server-fetched prices

### Key Discoveries:

- `FINNHUB_API_KEY` must be declared as `optional: true` in `astro.config.mjs` env schema and stored as a **text environment variable** (not a wrangler secret) — follows L1 in `context/foundation/lessons.md`
- The `prices` table is a global cache (no `user_id`) — prices are public market data; any authenticated user can read and upsert
- Finnhub `GET /api/v1/quote?symbol=TICKER&token=KEY` returns `{ c: number }` — `c` is the last traded price; `c === 0` signals no data (invalid ticker or no market activity)
- Server-side price fetch in Astro frontmatter: all unique tickers are fetched in parallel via `Promise.allSettled`. Worst-case page time = max single Finnhub latency (bounded by 2.5s AbortController timeout) — within the 3s NFR budget
- "Today's cache" optimization: skip Finnhub call if `prices.fetched_at` date equals today — prevents redundant API calls on repeat visits
- `supabase.from("prices").upsert({...})` — PostgreSQL upsert on PRIMARY KEY; no additional conflict handling needed
- `DashboardView` receives `initialPrices: Record<string, PriceData>` alongside `initialTransactions`; positions are computed via a pure `computePositions()` function — optimistic add-transaction still works because positions recompute from updated transaction state with the same static prices map

## What We're NOT Doing

- No real-time or intraday prices — EOD only per PRD §FR-007
- No currency conversion (FR-009 parked) — ROI is skipped for tickers with mixed purchase currencies
- No Finnhub currency inference — price currency is assumed to match the transaction's currency (works for the primary use case: US equities bought in USD)
- No per-user price isolation — prices are a shared public cache, no `user_id`
- No price refresh button or manual refresh — server-side on each page load with today's-cache optimization is sufficient for MVP
- No edit/delete on portfolio rows — S-04 scope
- No sector allocation chart — S-05 scope

## Implementation Approach

Four sequential phases. Phase 1 is the DB migration (prerequisite for caching). Phase 2 wires Finnhub (no UI change). Phase 3 updates the data flow in `dashboard.astro` (no UI change visible yet). Phase 4 delivers the UI. Each phase is independently verifiable before the next begins.

Data flow after this change:
```
dashboard.astro (server):
  1. fetch transactions (existing)
  2. extract unique tickers
  3. read today's cached prices from `prices` table
  4. for tickers without today's cache: fetchQuote(ticker, 2.5s timeout)
  5. upsert successful Finnhub results into `prices` table
  6. use stale cache for failed fetches
  7. pass initialTransactions + initialPrices to DashboardView

DashboardView (client):
  computePositions(transactions, prices) → PortfolioPosition[]
  renders 7-column table
  add-transaction → optimistic prepend to transactions → positions recompute
```

## Critical Implementation Details

**`FINNHUB_API_KEY` env var setup** — add to `astro.config.mjs` env schema as `optional: true`; store in Cloudflare Workers as a text environment variable (not a wrangler secret) per L1. The `fetchQuote` function must guard for a missing key (`if (!FINNHUB_API_KEY) return null`) — during local dev the key is in `.env`; during CI it may be absent and no price fetching should fail fatally.

**`c === 0` guard in Finnhub response** — Finnhub returns `{ c: 0, ... }` for invalid tickers or outside market hours with no prior data. Treat `c === 0` as "no data" and return `null` from `fetchQuote` so the cache isn't written with a zero price.

**Upsert RLS policy** — Supabase's `.upsert()` on a row that already exists issues an UPDATE internally. The `prices` table needs both INSERT and UPDATE policies for authenticated users; a single `FOR ALL` policy is cleanest.

**`computePositions` must be called in a `useMemo`** — `DashboardView` calls it on every render. Since `prices` is static (passed as initial prop, never updated) and `transactions` changes only on optimistic add, wrapping in `useMemo([transactions])` prevents wasteful recomputation on unrelated re-renders.

---

## Phase 1: DB migration — `prices` cache table

### Overview

Create the `prices` Supabase table that caches the last known EOD price per ticker. This is a shared global table (no user isolation) with RLS permitting any authenticated user to read and upsert. This phase has no visible effect on the UI.

### Changes Required:

#### 1. Create prices migration

**File**: `supabase/migrations/20260609000000_create_prices.sql` *(new file)*

**Intent**: Define the `prices` table and its RLS policies. The table is a simple key-value cache: ticker → last known price + fetch timestamp. No user_id — prices are public market data shared across all users.

**Contract**: The migration must:
- Create `public.prices` with columns: `ticker TEXT PRIMARY KEY`, `price NUMERIC(15,4) NOT NULL CHECK (price > 0)`, `fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- Enable RLS: `ALTER TABLE public.prices ENABLE ROW LEVEL SECURITY`
- Add three policies: SELECT (USING `auth.role() = 'authenticated'`), INSERT (WITH CHECK `auth.role() = 'authenticated'`), UPDATE (USING `auth.role() = 'authenticated'`)

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db push` completes without errors (or SQL pasted in Supabase Dashboard SQL Editor without errors)
- `npx astro check` passes
- `npm run lint` passes

#### Manual Verification:

- `prices` table visible in Supabase Dashboard → Table Editor with columns: `ticker`, `price`, `fetched_at`
- RLS is enabled on the table (shown in Table Editor settings)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Finnhub client + env key declaration

### Overview

Declare the `FINNHUB_API_KEY` environment variable in Astro's env schema and create the `fetchQuote` utility that wraps the Finnhub quote endpoint with a 2.5-second AbortController timeout. No application behaviour changes yet — only infrastructure.

### Changes Required:

#### 1. Add FINNHUB_API_KEY to env schema

**File**: `astro.config.mjs`

**Intent**: Register `FINNHUB_API_KEY` in Astro's typed env schema so it can be imported via `astro:env/server`. Declare it `optional: true` so the build doesn't fail when the key is absent (local dev without a key should degrade gracefully, not crash).

**Contract**: Add to the existing `env.schema` object:
```typescript
FINNHUB_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
```

#### 2. Create Finnhub client

**File**: `src/lib/finnhub.ts` *(new file)*

**Intent**: Provide a single `fetchQuote(ticker)` function that calls the Finnhub quote endpoint with a hard 2.5-second timeout. Returns `null` on any failure — missing API key, network error, timeout, non-200 response, or `c === 0` (no market data). Callers treat `null` as "unavailable" and fall back to cache.

**Contract**: Export one function `fetchQuote(ticker: string): Promise<number | null>`. Implementation:
1. Guard: `if (!FINNHUB_API_KEY) return null`
2. Create `AbortController`; `setTimeout(() => controller.abort(), 2500)`
3. `fetch(\`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_API_KEY}\`, { signal: controller.signal })`
4. If `!response.ok` → return `null`
5. Parse body as `{ c: number }` — if `!data.c || data.c === 0` → return `null`
6. Return `data.c`
7. Wrap in try/catch; catch → return `null`; finally → `clearTimeout(timeout)`

Return type is `number | null` (just the price, not the full quote object — callers only need `c`).

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes with zero errors (env schema type-checks correctly)
- `npm run lint` passes
- `npm run build` succeeds

#### Manual Verification:

- `src/lib/finnhub.ts` exists and exports `fetchQuote`
- In `.env` (local): `FINNHUB_API_KEY=<real_key>` is set
- In Cloudflare Workers dashboard: `FINNHUB_API_KEY` is added as a text environment variable (not a secret)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Portfolio types, `computePositions` pure function, and dashboard price fetching

### Overview

Introduce the `PriceData` and `PortfolioPosition` types and the `computePositions` aggregation function. Update `dashboard.astro` to fetch and cache Finnhub prices server-side and pass `initialPrices` to `DashboardView`. The dashboard will type-check but the UI still renders the old 5-column table (Phase 4 updates the view).

### Changes Required:

#### 1. Create portfolio types and pure function

**File**: `src/lib/portfolio.ts` *(new file)*

**Intent**: Define the `PriceData` and `PortfolioPosition` TypeScript types, and provide `computePositions` — a pure function that aggregates raw transactions with fetched prices into portfolio rows ready for display. Lives in `src/lib/` (not a component) because the same function will be called both in `DashboardView` (client) and potentially in tests.

**Contract**:

Export `PriceData`:
```typescript
export interface PriceData {
  price: number;
  fetched_at: string; // ISO timestamp
  is_fresh: boolean;  // true = fetched today, false = stale cache
}
```

Export `PortfolioPosition`:
```typescript
export interface PortfolioPosition {
  ticker: string;
  totalShares: number;
  avgCost: number;
  currency: string;         // transaction currency (or "MULTI" if mixed)
  hasMultipleCurrencies: boolean;
  currentPrice: number | null;
  isFresh: boolean;
  priceDate: string | null; // fetched_at ISO string, shown in stale indicator
  positionValue: number | null;
  roiPct: number | null;
  roiAbs: number | null;
}
```

Export `computePositions(transactions: Transaction[], prices: Record<string, PriceData>): PortfolioPosition[]`:
- Group transactions by `ticker.toUpperCase()`
- For each group:
  - `totalShares = sum(t.shares)`
  - `avgCost = sum(t.shares × t.purchase_price) / totalShares`
  - `hasMultipleCurrencies = new Set(txns.map(t => t.currency)).size > 1`
  - `currency = hasMultipleCurrencies ? "MULTI" : txns[0].currency`
  - `currentPrice = prices[ticker]?.price ?? null`
  - `isFresh = prices[ticker]?.is_fresh ?? false`
  - `priceDate = prices[ticker]?.fetched_at ?? null`
  - `positionValue = currentPrice != null ? currentPrice × totalShares : null`
  - `roiAbs = !hasMultipleCurrencies && currentPrice != null ? (currentPrice − avgCost) × totalShares : null`
  - `roiPct = !hasMultipleCurrencies && currentPrice != null ? (currentPrice − avgCost) / avgCost × 100 : null`
- Return array preserving insertion order (order determined by first occurrence of each ticker in the transactions array)

#### 2. Update dashboard.astro — add price fetching

**File**: `src/pages/dashboard.astro`

**Intent**: After fetching transactions (existing), extract unique tickers, read today's cached prices from the `prices` table, fetch fresh prices from Finnhub for tickers missing today's cache (parallel, 2.5s timeout each), upsert successful results back to the `prices` table, then pass the assembled `prices` record to `DashboardView` alongside `initialTransactions`.

**Contract**: New frontmatter additions after the existing `transactions` fetch:
1. Derive today's date string: `new Date().toISOString().split("T")[0]`
2. Extract unique tickers: `[...new Set(transactions.map(t => t.ticker.toUpperCase()))]`
3. If `supabase && uniqueTickers.length > 0`: query `supabase.from("prices").select("*").in("ticker", uniqueTickers)` → build a `Map<string, { price, fetched_at }>` from result
4. Initialise `prices: Record<string, PriceData> = {}`
5. `await Promise.allSettled(uniqueTickers.map(async (ticker) => { ... }))` — for each ticker:
   - If cached row exists and `cached.fetched_at.split("T")[0] === today` → write to `prices[ticker]` with `is_fresh: true`, return (skip Finnhub)
   - Otherwise: call `fetchQuote(ticker)` from `@/lib/finnhub`
   - If quote is non-null → `await supabase.from("prices").upsert({ ticker, price: quote, fetched_at: new Date().toISOString() })` → write to `prices[ticker]` with `is_fresh: true`
   - If quote is null and cached row exists → write to `prices[ticker]` with `is_fresh: false` (stale fallback)
   - If both fail → leave `prices[ticker]` absent (results in `currentPrice: null` in positions)
6. Pass `initialPrices={prices}` prop to `<DashboardView>` (in addition to existing `initialTransactions` and `userEmail`)

`DashboardView` import signature gains `initialPrices: Record<string, PriceData>` — this will cause a TypeScript error until Phase 4 updates the component props. The plan expects Phase 4 to follow immediately.

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes (may show one expected type error on `DashboardView` until Phase 4 — acceptable at this phase boundary, note it)
- `npm run lint` passes

#### Manual Verification:

- After running `npm run dev`, visiting the dashboard with real transactions and a valid `FINNHUB_API_KEY`: Supabase Dashboard → Table Editor → `prices` table shows rows with `ticker`, `price`, and `fetched_at` for the user's tickers
- A second page load within the same day: the `prices` rows' `fetched_at` timestamps do not change (today's-cache optimization working)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: DashboardView — 7-column portfolio table UI

### Overview

Update `DashboardView` to accept `initialPrices` alongside `initialTransactions`, compute `PortfolioPosition[]` from them using `computePositions`, and render the new 7-column portfolio table with ROI colouring and the stale-price indicator. The empty state and the add-transaction flow are unchanged.

### Changes Required:

#### 1. Update DashboardView component

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Add `initialPrices: Record<string, PriceData>` to props; replace the 5-column per-transaction table with a 7-column per-position table that shows aggregated portfolio data with ROI; compute positions in `useMemo` so optimistic transaction adds recompute positions without re-fetching prices.

**Contract**:

Props change:
- Add `initialPrices: Record<string, PriceData>` — import `PriceData` from `@/lib/portfolio`

New state/derived data:
- `const [prices] = useState(initialPrices)` — prices are static after mount (server-fetched once)
- `const positions = useMemo(() => computePositions(transactions, prices), [transactions, prices])` — import `computePositions`, `PortfolioPosition` from `@/lib/portfolio`

Table columns (replace the existing `<table>`):
| # | Header | Value |
|---|---|---|
| 1 | Ticker | `position.ticker` (bold) |
| 2 | Shares | `position.totalShares.toFixed(4)` |
| 3 | Avg. Cost | `position.avgCost.toFixed(2)` + currency badge (skip if MULTI) |
| 4 | Current Price | price or `—` with optional ⚠ stale indicator |
| 5 | Value | `position.positionValue?.toFixed(2)` or `—` |
| 6 | ROI % | formatted with sign; green if ≥ 0, red if < 0; `—` if null |
| 7 | ROI | formatted with sign + currency; green/red; `—` if null |

Current Price cell rendering:
- If `currentPrice === null` → show `—`
- If `currentPrice !== null && !isFresh` → show price + ` ⚠ ` + formatted date from `priceDate` (e.g. `"09 Jun"` using `new Date(priceDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })`)
- If `currentPrice !== null && isFresh` → show price only

ROI colouring:
- Positive (≥ 0): `text-emerald-400`
- Negative (< 0): `text-red-400`
- Null: `text-blue-100/40`

Currency badge for Avg. Cost / ROI columns:
- When `!hasMultipleCurrencies`: append the currency string after the value (e.g. `"1234.56 USD"`)
- When `hasMultipleCurrencies`: show `—` for ROI cells; append no currency badge to Avg. Cost

Empty state: unchanged from current implementation.

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes with zero errors
- `npm run lint` passes
- `npm run build` succeeds

#### Manual Verification:

- Logged-in user with ≥ 1 transaction sees a 7-column table with Ticker, Shares, Avg. Cost, Current Price, Value, ROI %, ROI abs.
- Multiple transactions for the same ticker are aggregated into one row (correct totalShares and avgCost)
- ROI % is correct: `(current - avg) / avg × 100` — verify with a known transaction manually
- Positive ROI is green, negative ROI is red
- When Finnhub is unreachable (disable network in browser DevTools → hard reload), stale prices are shown with ⚠ and date
- When no price is available at all (new ticker, no cache), Current Price and ROI show `—`
- Adding a new transaction via the modal for an existing ticker: the row updates immediately with revised Shares and Avg. Cost (no reload needed)
- Adding a new transaction for a brand-new ticker: a new row appears with `—` for Current Price and ROI
- Empty state (no transactions): unchanged — shows "No transactions yet" with Add button

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding.

---

## Testing Strategy

### Manual Testing Steps:

1. Sign in with a test account that has ≥ 2 transactions for the same ticker at different prices → verify weighted average is correct
2. Verify ROI % formula manually: `(current_price - avg_cost) / avg_cost × 100`
3. Verify position value: `current_price × total_shares`
4. Add a second transaction for an existing ticker → verify row updates without reload (shares and avg cost)
5. Add a transaction for a new ticker → verify new row appears with `—` for price
6. Kill network connectivity → reload page → verify stale prices shown with ⚠ indicator
7. Restore network → reload → verify ⚠ disappears and fresh prices appear
8. Verify Supabase Dashboard `prices` table has one row per unique ticker (not per user)
9. Sign in as a second user with different tickers → verify their prices also use the same `prices` table cache
10. Verify 3-second performance: with ≤ 20 positions, dashboard should be interactive within 3 seconds

## Performance Considerations

Finnhub calls are parallel (`Promise.allSettled`). With up to 50 unique tickers, all 50 calls fire simultaneously; the page is held only until the slowest call completes (bounded at 2.5s). The today's-cache optimization means repeat visits within the same day skip Finnhub entirely, reducing dashboard load to a single Supabase query.

## Migration Notes

No changes to the existing `transactions` table. The new `prices` table is additive and backward-compatible — if it doesn't exist (migration not yet applied), the price fetch code will error, but the transactions table and all existing data are unaffected.

## References

- PRD: `context/foundation/prd.md` §FR-007, US-01
- Roadmap: `context/foundation/roadmap.md` S-03
- EOD API decision: `context/foundation/eod-api-decision.md`
- Lessons: `context/foundation/lessons.md` L1 (text env vars for astro:env), L3 (double quotes in TS)
- Prior plan (S-02): `context/archive/2026-06-06-add-transaction/plan.md`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: DB migration — `prices` cache table

#### Automated

- [x] 1.1 Migration applies cleanly (`npx supabase db push` or SQL Editor) — 6c3e4df
- [x] 1.2 `npx astro check` passes — 6c3e4df
- [x] 1.3 `npm run lint` passes — 6c3e4df

#### Manual

- [x] 1.4 `prices` table visible in Supabase Dashboard with correct columns — 6c3e4df
- [x] 1.5 RLS enabled on `prices` table — 6c3e4df

### Phase 2: Finnhub client + env key declaration

#### Automated

- [x] 2.1 `npx astro check` passes with zero errors — dd60051
- [x] 2.2 `npm run lint` passes — dd60051
- [x] 2.3 `npm run build` succeeds — dd60051

#### Manual

- [x] 2.4 `src/lib/finnhub.ts` exists and exports `fetchQuote` — dd60051
- [x] 2.5 `FINNHUB_API_KEY` set in `.env` (local) and as text env var in Cloudflare Workers — dd60051

### Phase 3: Portfolio types, `computePositions`, and dashboard price fetching

#### Automated

- [x] 3.1 `npx astro check` passes
- [x] 3.2 `npm run lint` passes

#### Manual

- [x] 3.3 After page load, `prices` table contains rows for the user's tickers
- [x] 3.4 Second same-day page load does not update `fetched_at` (cache hit)

### Phase 4: DashboardView — 7-column portfolio table UI

#### Automated

- [ ] 4.1 `npx astro check` passes with zero errors
- [ ] 4.2 `npm run lint` passes
- [ ] 4.3 `npm run build` succeeds

#### Manual

- [ ] 4.4 Portfolio table shows 7 columns with aggregated per-ticker data
- [ ] 4.5 Weighted average cost is correct for multi-transaction tickers
- [ ] 4.6 ROI % and ROI abs. are mathematically correct
- [ ] 4.7 Positive ROI is green; negative ROI is red
- [ ] 4.8 Stale price shows ⚠ + date; unavailable price shows `—`
- [ ] 4.9 Optimistic add updates existing ticker row without reload
- [ ] 4.10 New ticker add creates new row with `—` for price
- [ ] 4.11 Empty state unchanged
