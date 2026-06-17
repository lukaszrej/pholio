---
date: 2026-06-17T00:00:00+00:00
researcher: Claude Sonnet 4.6
git_commit: ceb2b50d365347fe4de7539d31e8e2dbe9902e05
branch: main
repository: Pholio
topic: "WatchlistPanel: replace mocked quotes with live Finnhub data"
tags: [research, watchlist, finnhub, api, caching, rate-limiting]
status: complete
last_updated: 2026-06-17
last_updated_by: Claude Sonnet 4.6
---

# Research: WatchlistPanel — Replace Mocked Quotes with Live Finnhub Data

**Date**: 2026-06-17  
**Researcher**: Claude Sonnet 4.6  
**Git Commit**: ceb2b50d365347fe4de7539d31e8e2dbe9902e05  
**Branch**: main  
**Repository**: Pholio

---

## Research Question

What is needed to replace the hardcoded mock ticker data in `WatchlistPanel` with real Finnhub API calls, while minimising requests against the free tier (60 req/min)?

---

## Summary

The mocked data lives entirely in the client-side `WatchlistPanel.tsx`. A real implementation requires a **new server-side API endpoint** (`/api/watchlist/quotes`) that bridges the client component to the server-only Finnhub module, reusing the existing Supabase `prices` table as a daily cache. The biggest gaps are:

1. The existing `fetchQuote()` in `src/lib/finnhub.ts` only extracts two fields (`c`, `dp`); the watchlist needs five additional OHLC fields.
2. Company names (`name` field on `WatchItem`) come from Finnhub's `/stock/profile2` — a second, separate endpoint that is currently only used for sector classification.
3. The `prices` table schema stores `price` + `change_pct` only; extended OHLC columns would need to be added to cache OHLC data daily without extra calls.

Rate-limit exposure is low: portfolio tickers are pre-warmed on every SSR page load; only net-new watchlist-only tickers need a fresh Finnhub call (at most once per calendar day per ticker).

---

## Detailed Findings

### WatchlistPanel — Component Structure

**File**: `src/components/portfolio/WatchlistPanel.tsx` (253 lines)

- Accepts **no props** (line 65) — fully self-contained React client component.
- Used in `src/components/transactions/DashboardView.tsx:592` only when `activeTab === "all"`.
- Persists the watchlist to `localStorage` key `pholio_watchlist` (line 31).
- Default tickers on first load: `["AAPL", "NVDA", "MSFT", "TSLA"]` (line 75).

**TypeScript types** (lines 4–16):

```typescript
interface WatchItem {
  ticker: string;
  name: string; // company name — NOT returned by /quote
  c: number; // current price
  d: number; // absolute change
  dp: number; // percent change
  h: number; // day high
  l: number; // day low
  o: number; // open
  pc: number; // previous close
}

type QuoteData = Omit<WatchItem, "ticker">;
```

**Mock data** (lines 18–29) — `MOCK_QUOTES: Record<string, QuoteData | undefined>` with 10 hardcoded entries covering AAPL, MSFT, GOOGL, NVDA, AMZN, META, TSLA, JPM, V, BRKB.

**Local mock `fetchQuote()`** (lines 34–53):  
Returns either a `MOCK_QUOTES` entry for known tickers, or generates **random** OHLC values for unknown tickers. This is the function that must be replaced.

---

### Existing Finnhub Client

**File**: `src/lib/finnhub.ts`

Two exported functions, both **server-side only** (import `FINNHUB_API_KEY` from `astro:env/server`):

```typescript
// Returns { price: number; changePct: number | null } | null
export async function fetchQuote(ticker: string);
// Calls: https://finnhub.io/api/v1/quote?symbol=<ticker>
// Extracts: c (price) and dp (changePct) only
// Full response also includes: d, h, l, o, pc — currently discarded

// Returns string | null
export async function fetchSector(ticker: string);
// Calls: https://finnhub.io/api/v1/stock/profile2?symbol=<ticker>
// Extracts: finnhubIndustry only
// Full response also includes: name (company name) — currently discarded
```

Both functions share the same patterns:

- 2.5-second `AbortController` timeout
- `X-Finnhub-Token` header
- `null` return on any error (never throws)

**Gap**: `fetchQuote()` discards `d`, `h`, `l`, `o`, `pc` that Finnhub already returns in the same call — no extra API requests needed to get these.

**Gap**: `fetchSector()` discards `name` that `/stock/profile2` already returns — no extra API call needed to also capture the company name.

---

### Supabase Prices Table

**Migration**: `supabase/migrations/20260609000000_create_prices.sql`

| Column       | Type          | Notes                                     |
| ------------ | ------------- | ----------------------------------------- |
| `ticker`     | TEXT          | PRIMARY KEY                               |
| `price`      | NUMERIC(15,4) | = Finnhub `c`                             |
| `fetched_at` | TIMESTAMPTZ   | Cache timestamp                           |
| `change_pct` | NUMERIC(8,4)  | = Finnhub `dp`, added in `20260616000000` |

**Missing columns**: `change_abs` (=`d`), `high` (=`h`), `low` (=`l`), `open` (=`o`), `prev_close` (=`pc`).

**TTL**: Same-day — any row where `DATE(fetched_at) = CURRENT_DATE` is considered fresh.

**RLS**: Any authenticated user may SELECT, INSERT, UPDATE. No DELETE. Shared across all users (no `user_id` column — by design, prices are global market data).

---

### Supabase Sectors Table

**Used by**: `dashboard.astro` for sector allocation chart.

| Column       | Type        | Notes                       |
| ------------ | ----------- | --------------------------- |
| `ticker`     | TEXT        | PRIMARY KEY                 |
| `sector`     | TEXT        | = Finnhub `finnhubIndustry` |
| `fetched_at` | TIMESTAMPTZ | Cache timestamp             |

**TTL**: 7 days (`SECTOR_TTL_MS = 604_800_000`).

**Gap**: Company `name` from `/stock/profile2` is not stored. Adding a `name` column here would let the watchlist API return company names at zero extra Finnhub calls (re-used from sector refresh that already runs at page load).

---

### Price Caching Layer

**File**: `src/lib/prices.ts` — `refreshPricesForTickers(tickers, supabase)`

Current flow (runs on every SSR page load in `dashboard.astro`):

1. Batch-read all tickers from Supabase `prices` table.
2. For each ticker: skip if cached today; else call `fetchQuote()` via `p-limit(10)`.
3. Upsert fresh data back into `prices`.
4. Returns `Record<string, PriceData>` (`{ price, fetched_at, is_fresh, changePct }`).

This pre-warms the cache for all portfolio tickers on every page load. Any watchlist ticker that is also a portfolio ticker will already be cached — **0 extra Finnhub calls**.

---

### Rendering Architecture

- **Mode**: SSR (`output: "server"`) via Cloudflare Workers.
- **No client-side data library**: No React Query / SWR / TanStack Query.
- **Price data flow**: Fetched server-side → passed as serialised props to `DashboardView` → immutable in client state.
- **WatchlistPanel is fully client-side**: It cannot call `astro:env/server` directly. It needs an HTTP endpoint (`/api/...`) to reach Finnhub.
- **Existing API pattern**: REST endpoints under `src/pages/api/` using `APIRoute` handlers that authenticate via `context.locals.user`.

---

## Code References

- `src/components/portfolio/WatchlistPanel.tsx:4-16` — `WatchItem` and `QuoteData` TypeScript types
- `src/components/portfolio/WatchlistPanel.tsx:18-29` — `MOCK_QUOTES` hardcoded data (to be removed)
- `src/components/portfolio/WatchlistPanel.tsx:34-53` — mock `fetchQuote()` (to be replaced)
- `src/components/portfolio/WatchlistPanel.tsx:65-80` — state initialisation from localStorage / MOCK_QUOTES
- `src/components/transactions/DashboardView.tsx:9` — import of WatchlistPanel
- `src/components/transactions/DashboardView.tsx:592` — render site (activeTab === "all")
- `src/lib/finnhub.ts:1` — `astro:env/server` import (server-only boundary)
- `src/lib/finnhub.ts:34-64` — `fetchQuote()` — discards OHLC fields from the Finnhub response
- `src/lib/finnhub.ts:6-27` — `fetchSector()` — discards `name` from `/stock/profile2` response
- `src/lib/prices.ts:6-68` — `refreshPricesForTickers()` with p-limit(10) and daily cache logic
- `supabase/migrations/20260609000000_create_prices.sql` — `prices` table schema
- `supabase/migrations/20260616000000_*.sql` — `change_pct` column addition
- `src/pages/api/` — existing REST endpoint patterns to follow

---

## Architecture Insights

### Rate-limit budget

Default watchlist (4 tickers) + typical portfolio (~5–10 unique tickers) = significant overlap. On a warm cache day:

- Portfolio SSR pre-warms all portfolio tickers → 0 Finnhub calls at page load.
- Watchlist API call hits Supabase cache for any ticker that overlaps with portfolio → 0 extra calls.
- Only net-new watchlist-only tickers trigger a Finnhub call, and only once per calendar day.
- Realistic steady-state: **0–3 extra Finnhub calls per page load** for a typical user.
- Worst-case (completely disjoint 10-ticker watchlist, cold cache): 10 calls → well within 60 req/min.

### Two implementation options for OHLC data

**Option A — Extend `prices` table with OHLC columns** (recommended for full caching):

- Add `change_abs NUMERIC(8,4)`, `high NUMERIC(15,4)`, `low NUMERIC(15,4)`, `open NUMERIC(15,4)`, `prev_close NUMERIC(15,4)` to `prices`.
- Extend `fetchQuote()` return type to include all fields; update `refreshPricesForTickers()` to upsert them.
- Watchlist API can then read everything from Supabase — zero extra Finnhub calls for cached tickers.
- Downside: migration needed; `PriceData` interface + `prices.ts` upsert logic must change.

**Option B — Compute missing fields client-side, fetch OHLC from Finnhub on-demand**:

- `d` can be derived: `d = c - pc` (no extra field needed if we store `pc`).
- Watchlist API fetches `h`, `l`, `o`, `pc` fresh from Finnhub for non-portfolio tickers (at most once per day if watchlist API also caches).
- Downside: OHLC not cached in Supabase → Finnhub call required on first access per day, even for portfolio tickers.

### Company name gap

`WatchItem.name` is not available from the `/quote` endpoint. It requires `/stock/profile2`. Options ranked by API-call cost:

1. **Extend `sectors` table with a `name TEXT` column** — when sector is refreshed (7-day TTL), also save name. Watchlist API JOINs sectors for names. Cost: 0 extra calls if sector already cached.
2. **Hardcode a small lookup map for the 10 default tickers** — only works for defaults, breaks for user-added symbols.
3. **Fetch `/stock/profile2` per ticker in watchlist API** — 1 extra call per ticker per 7 days, but requires a separate "profiles" cache table to avoid burning the rate limit.
4. **Drop `name` from WatchItem** — show ticker only, no company name in the UI.

Option 1 is the most elegant given the infrastructure already exists.

---

## Historical Context

- `context/archive/2026-06-09-portfolio-roi-view/plan.md` — introduced `fetchQuote()` and the Supabase `prices` cache; established the daily-TTL pattern.
- `context/archive/2026-06-10-sector-allocation-chart/plan.md` — introduced `fetchSector()` and the 7-day sector cache; `/stock/profile2` endpoint already budgeted.
- `context/foundation/test-plan.md` — virtual module mocking strategy for `astro:env/server` (relevant for unit-testing the new API endpoint).

---

## Open Questions

1. **OHLC caching strategy**: Extend `prices` table (Option A) vs. fetch fresh per watchlist call (Option B)? Option A avoids re-fetching on each watchlist load but requires a migration.
2. **Company names**: Extend `sectors` table with a `name` column, or drop company names from the live watchlist?
3. **Who triggers watchlist refresh?**: Does the new `/api/watchlist/quotes` endpoint refresh Finnhub proactively on its own, or rely on the SSR pass having already warmed the `prices` cache? A hybrid (SSR pre-warms portfolio tickers; API endpoint handles watchlist-only tickers) seems cleanest.
4. **Authentication requirement on the new endpoint**: Should unauthenticated users be able to fetch quotes (anonymous market data)? The current `prices` RLS requires auth. Recommend keeping auth requirement consistent.
5. **Loading state in WatchlistPanel**: Currently no loading UI exists (data is synchronous from localStorage). The live version will have async latency — a skeleton loader or "loading..." state will need to be added.
