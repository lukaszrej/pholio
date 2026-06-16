# Ticker Tape Daily % Change Implementation Plan

## Overview

Replace the ticker tape's per-position gain/loss (`roiPct`) with the market's **daily percentage change** (`dp` from Finnhub's `/quote` endpoint). The `dp` value is already returned by every `/quote` call we make today but is discarded — so this adds **zero new API calls** and stays within the 60 req/min free-tier budget. The change threads `dp` through the existing price pipeline into a new nullable `change_pct` DB column, then swaps the TickerTape display.

## Current State Analysis

The price pipeline is mature and well-understood:

```
fetchQuote (finnhub.ts) → refreshPricesForTickers (prices.ts) → prices table (Supabase)
   → PriceData → computePositions (portfolio.ts) → PortfolioPosition → TickerTape (DashboardView.tsx)
```

- `fetchQuote` (`src/lib/finnhub.ts:34-63`) calls `/api/v1/quote`, casts the response as `{ c: number }`, and returns only `data.c`. The response also contains `dp` (signed daily percent change) which is silently dropped.
- The `prices` table (`supabase/migrations/20260609000000_create_prices.sql`) has `ticker` (PK), `price NUMERIC(15,4)`, `fetched_at TIMESTAMPTZ`. No change column. UPDATE RLS policy already has both `USING` and `WITH CHECK` (`20260609000001_fix_prices_update_policy.sql`) — no policy change needed for a new column.
- `refreshPricesForTickers` (`src/lib/prices.ts:6-46`) constructs `PriceData` in three paths: fresh cache hit (line 27), fresh Finnhub fetch + upsert (lines 34-37), stale cache fallback (line 39).
- `PriceData` (`src/lib/portfolio.ts:3-7`) = `{ price, fetched_at, is_fresh }`. `is_fresh` is computed at query time (`prices.ts:26`), not stored. `change_pct`, by contrast, IS stored (cached like `price`).
- `PortfolioPosition` (`src/lib/portfolio.ts:9-23`) carries `roiPct` (line 21), computed at line 124 as `((currentPrice - avgCost) / avgCost) * 100` — the user's personal cost-basis return, **not** the market's daily move.
- `TickerTape` (`src/components/transactions/DashboardView.tsx:35-74`) filters to positions where `currentPrice !== null && roiPct !== null` (lines 36-38) and renders ticker + price + colored `roiPct` badge (lines 64-67).

## Desired End State

The ticker tape shows, per held ticker: **symbol · price · daily % change** (green ▲ / red ▼), where the daily % change is Finnhub's `dp`. Tickers whose daily change is unavailable still appear showing **symbol · price** with no change badge. `roiPct` continues to drive the per-position gain/loss columns in `PortfolioSection` and `TickerCard` — unchanged.

Verify: open the dashboard, confirm the tape's percentages match the market's daily move (not the user's position return), and that a ticker with a stale/missing change still renders its price.

### Key Discoveries:

- `dp` piggybacks on the existing `/quote` call — no new API calls (`src/lib/finnhub.ts:43`).
- `priceDate` column addition (`context/archive/2026-06-12-price-date-column/`) is an exact precedent for the pass-through pattern (PriceData field → PortfolioPosition field via `computePositions`).
- Nullable column + nullable TS type required (lessons.md L4 — DB-backed values default to `T | null`).
- `change_pct` is stored in DB (cached), unlike the runtime-computed `is_fresh`.

## What We're NOT Doing

- **Not** touching `roiPct` anywhere outside the TickerTape — it stays in `PortfolioSection` and `TickerCard` as the cost-basis return.
- **Not** adding new Finnhub API calls or changing the daily-cache strategy.
- **Not** forcing a backfill of already-cached rows — `change_pct` populates naturally on each ticker's next daily refresh.
- **Not** storing `d` (absolute change), `pc`, `o`, `h`, `l`, or `t` from the quote response.
- **Not** making `changePct` sortable or adding it to the portfolio tables.

## Implementation Approach

Extend the pipeline bottom-up so types stay consistent at every step: DB column → `fetchQuote` signature → `prices.ts` propagation → `PriceData`/`PortfolioPosition` types → `computePositions` pass-through → test fixtures. This is Phase 1 and leaves the tape visually unchanged (all tests green, data flowing). Phase 2 is the isolated UI swap in TickerTape.

`fetchQuote`'s signature change (`number | null` → `{ price; changePct } | null`) is a breaking internal API, but its only caller is `prices.ts` — both update atomically in Phase 1.

## Critical Implementation Details

**Null vs zero semantics.** `dp === 0` is a valid flat day and must be stored and displayed as `0.00%` — do NOT coerce it to null. Only a genuinely absent `dp` (missing field / non-numeric) becomes `null`. Note `fetchQuote` already returns `null` early when `c === 0` (`finnhub.ts:53`), so a row that exists always has a real price; `change_pct` nullability is independent of that guard.

---

## Phase 1: Data pipeline + types

### Overview

Add the `change_pct` column and thread `dp` from the Finnhub response all the way into `PortfolioPosition.changePct`, updating test fixtures so the suite stays green. No visible behavior change yet.

### Changes Required:

#### 1. Database migration

**File**: `supabase/migrations/20260616000000_add_change_pct_to_prices.sql` (new)

**Intent**: Add a nullable column to cache the daily percent change alongside each price. Nullable because pre-existing rows have no value and Finnhub may occasionally omit `dp`.

**Contract**: `ALTER TABLE public.prices ADD COLUMN change_pct NUMERIC(8,4);` — no `NOT NULL`, no `CHECK` (negative values are valid), no RLS change (column-level grants inherit the existing table policies).

#### 2. Finnhub quote fetcher

**File**: `src/lib/finnhub.ts`

**Intent**: Extract `dp` alongside `c` and return both, so the daily change reaches the cache layer.

**Contract**: `fetchQuote(ticker: string): Promise<{ price: number; changePct: number | null } | null>`. Cast the response as `{ c: number; dp: number }`. Keep the existing `c === 0 → null` guard (line 53). Derive `changePct` from `dp` when it is a finite number, else `null`. `0` is a valid value and must pass through (not be coerced to null).

#### 3. Price refresh / cache layer

**File**: `src/lib/prices.ts`

**Intent**: Persist `change_pct` to the `prices` table and propagate it through all three `PriceData` construction paths.

**Contract**: The cached-row read (`select("*")`, line 15) now includes `change_pct`; widen the local row type and `cacheMap` value to carry `change_pct: number | null`. Upsert (line 34) writes `{ ticker, price, fetched_at, change_pct }`. All three `PriceData` results (fresh cache hit line 27, fresh fetch line 37, stale fallback line 39) set `changePct`. The fresh-fetch path uses the value returned by `fetchQuote`; the two cache paths use the cached `change_pct` (may be `null` for pre-migration rows).

#### 4. PriceData + PortfolioPosition types and computePositions

**File**: `src/lib/portfolio.ts`

**Intent**: Carry `changePct` through the type layer and the position aggregator, mirroring the existing `priceDate` pass-through.

**Contract**: Add `changePct: number | null` to `PriceData` (lines 3-7) and to `PortfolioPosition` (lines 9-23). In `computePositions` (lines 97-147), read `priceEntry?.changePct ?? null` (same shape as `priceDate` at line 120) and include it in the returned position object. `changePct` is independent of the multi-currency / cost-basis logic that gates `roiPct` — it passes through unconditionally.

#### 5. Test fixtures

**File**: `src/lib/portfolio.test.ts`

**Intent**: Keep fixtures type-complete after the interface additions.

**Contract**: The `priceData()` builder (lines ~25-29) and `position()` builder (lines ~31-46) gain a `changePct` field defaulting to a representative value (e.g. `null` or a sample percent), overridable per test.

**File**: `src/test/integration/prices.integration.test.ts`

**Intent**: Reflect the new column in any asserted price-row shape and in the Finnhub stub response.

**Contract**: Where the test stubs the `finnhub.io` quote response, include a `dp` field; where it asserts the upserted/returned row shape, account for `change_pct` / `changePct`. No new test scenarios required in this phase.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck` (or project equivalent)
- Linting passes: `npm run lint`
- Unit tests pass: `npm run test` (portfolio + finnhub suites)
- Integration tests pass (prices integration suite)
- Migration file is valid SQL and applies cleanly against a fresh DB

#### Manual Verification:

- After a daily-cache refresh, a `prices` row shows a populated `change_pct` matching Finnhub's `dp` for that ticker
- Dashboard still renders unchanged (tape still shows `roiPct`) — confirming no premature UI break

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: TickerTape UI swap

### Overview

Swap the tape from `roiPct` to `changePct`, relaxing the filter so price-only rows still appear when the daily change is unavailable.

### Changes Required:

#### 1. TickerTape filter + display

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Show the market's daily % change instead of the position return, and keep tickers visible (price-only) when `changePct` is null.

**Contract**: Relax the filter (lines 36-38) so the type guard requires only `currentPrice !== null` (drop the `roiPct !== null` requirement); the narrowed type becomes `PortfolioPosition & { currentPrice: number }`. In the render (lines 64-67), render ticker + price always; render the colored change badge (`▲`/`▼`, `Math.abs(changePct)`, green `#0a9d6e` / red `#c41230`) **only when `p.changePct !== null`**. `changePct >= 0` selects the up arrow / green per the existing convention (so `0` shows ▲ 0.00% green).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests pass: `npm run test`

#### Manual Verification:

- Tape percentages reflect the market's daily move (cross-check one ticker against Finnhub/any quote source), not the user's cost-basis return
- A ticker with a populated `change_pct` shows symbol · price · colored % badge with correct arrow/color
- A ticker whose `change_pct` is null (e.g. a freshly-held ticker before its next refresh) shows symbol · price with no badge, and does not break the row layout
- No regression in `PortfolioSection` / `TickerCard` gain-loss columns (still driven by `roiPct`)

**Implementation Note**: After completing this phase and all automated verification passes, pause for final manual confirmation.

---

## Testing Strategy

### Unit Tests:

- `fetchQuote` returns `{ price, changePct }` with `dp` present; `changePct` is `null` when `dp` is absent/non-finite; `0` passes through as `0`; still returns `null` when `c === 0`.
- `computePositions` populates `changePct` from `PriceData`, independent of multi-currency gating.

### Integration Tests:

- `refreshPricesForTickers` upserts `change_pct` on a fresh fetch and returns it; cache-hit and stale-fallback paths return the cached `change_pct` (including `null` for legacy rows).

### Manual Testing Steps:

1. Load the dashboard; confirm the tape shows daily % change matching a market quote source.
2. Confirm a ticker with no cached `change_pct` shows price-only, no badge.
3. Confirm `PortfolioSection`/`TickerCard` returns columns are unchanged.

## Performance Considerations

No new API calls; `dp` rides the existing `/quote` request. One extra nullable column adds negligible storage. The daily-cache short-circuit (`prices.ts:26`) is unchanged.

## Migration Notes

`change_pct` populates naturally as each ticker's daily cache expires and re-fetches. Until then, legacy rows return `null` and those tickers render price-only in the tape. No backfill script or forced invalidation.

## References

- Related research: `context/changes/ticker-tape-daily-change/research.md`
- Pass-through precedent: `context/archive/2026-06-12-price-date-column/plan.md`
- Pipeline origin: `context/archive/2026-06-09-portfolio-roi-view/plan.md`
- Finnhub decision / rate limit: `context/foundation/eod-api-decision.md`
- Lessons: `context/foundation/lessons.md` (L3 RLS, L4 nullable signatures, L5 double quotes)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data pipeline + types

#### Automated

- [x] 1.1 Type checking passes — b9d4470
- [x] 1.2 Linting passes — b9d4470
- [x] 1.3 Unit tests pass (portfolio + finnhub) — b9d4470
- [x] 1.4 Integration tests pass (prices) — b9d4470
- [x] 1.5 Migration is valid SQL and applies cleanly against a fresh DB — b9d4470

#### Manual

- [x] 1.6 A refreshed `prices` row shows populated `change_pct` matching Finnhub `dp` — b9d4470
- [x] 1.7 Dashboard renders unchanged (tape still shows roiPct) — b9d4470

### Phase 2: TickerTape UI swap

#### Automated

- [x] 2.1 Type checking passes — 8a3ee1a
- [x] 2.2 Linting passes — 8a3ee1a
- [x] 2.3 Unit tests pass — 8a3ee1a

#### Manual

- [x] 2.4 Tape percentages reflect the market's daily move, not cost-basis return — 8a3ee1a
- [x] 2.5 Ticker with populated change_pct shows symbol · price · colored % badge — 8a3ee1a
- [x] 2.6 Ticker with null change_pct shows price-only, no badge, layout intact — 8a3ee1a
- [x] 2.7 No regression in PortfolioSection / TickerCard gain-loss columns — 8a3ee1a
