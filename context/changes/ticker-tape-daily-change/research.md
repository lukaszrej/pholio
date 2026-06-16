---
date: 2026-06-16T00:00:00+00:00
researcher: Claude Sonnet 4.6
git_commit: cc36215aa55e5d7f5ea60222656979ec7f56a087
branch: main
repository: Pholio
topic: "Ticker tape daily % change — pipeline research"
tags: [research, finnhub, prices, ticker-tape, PriceData, PortfolioPosition, supabase]
status: complete
last_updated: 2026-06-16
last_updated_by: Claude Sonnet 4.6
---

# Research: Ticker tape daily % change instead of position gain/loss

**Date**: 2026-06-16  
**Git Commit**: cc36215aa55e5d7f5ea60222656979ec7f56a087  
**Branch**: main  
**Repository**: Pholio

## Research Question

Replace the ticker tape's per-position gain/loss (`roiPct`) with the market's daily percentage change (`dp` from Finnhub `/quote`), without adding any extra API calls beyond the 60 req/min free-tier limit.

---

## Summary

The `dp` (daily % change) field is **already returned** by every `/api/v1/quote` call we make but is silently discarded. The entire change is a **pipeline extension** — extract `dp` alongside `c`, cache it in a new nullable `change_pct` column, thread it through `PriceData` → `PortfolioPosition` → `TickerTape`. Zero additional API calls required.

Six files change in production code + one SQL migration + two test fixture files.

---

## Detailed Findings

### 1. Finnhub `/quote` response — unused fields

**`src/lib/finnhub.ts:43-55`** — `fetchQuote` currently casts the response as `{ c: number }` and returns only `data.c`. The actual Finnhub response also includes:

| Field | Meaning                                        | Relevance    |
| ----- | ---------------------------------------------- | ------------ |
| `c`   | Current price (last close when market is shut) | already used |
| `dp`  | Percent change from previous close             | **needed**   |
| `d`   | Absolute change from previous close            | not needed   |
| `o`   | Open                                           | not needed   |
| `h`   | High                                           | not needed   |
| `l`   | Low                                            | not needed   |
| `pc`  | Previous close                                 | not needed   |
| `t`   | Timestamp                                      | not needed   |

When the market is closed (which it is for the vast majority of any 24h window), `c` = yesterday's close and `pc` = the close before that, so `dp` gives exactly the "change from pre-previous to previous close" the user asked for.

**Required change**: cast the response as `{ c: number; dp: number }`, return `{ price: number; changePct: number } | null` instead of `number | null`.

---

### 2. DB schema — prices table

**`supabase/migrations/20260609000000_create_prices.sql`**

```sql
CREATE TABLE public.prices (
  ticker     TEXT PRIMARY KEY,
  price      NUMERIC(15,4) NOT NULL CHECK (price > 0),
  fetched_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);
```

No `change_pct` column exists. Need to add it as nullable (existing rows won't have it; also Finnhub may return `dp = 0` on weekends for some symbols — those should be treated as null rather than "flat").

**RLS policies** (per L3 lesson — both USING and WITH CHECK on UPDATE):

- SELECT: `USING (auth.role() = 'authenticated')` ✓
- INSERT: `WITH CHECK (auth.role() = 'authenticated')` ✓
- UPDATE: fixed in `20260609000001_fix_prices_update_policy.sql` — has both `USING` and `WITH CHECK` ✓
- Table grants in `20260615000000_grant_table_permissions.sql` — table-level, no column changes needed ✓

**Required migration**:

```sql
ALTER TABLE public.prices ADD COLUMN change_pct NUMERIC(8,4);
```

No `NOT NULL`, no `CHECK` — nullable is correct here.

---

### 3. PriceData type — `src/lib/portfolio.ts:3-7`

Current:

```typescript
export interface PriceData {
  price: number;
  fetched_at: string;
  is_fresh: boolean;
}
```

`is_fresh` is **computed at query time** in `prices.ts:26` (comparing `fetched_at` date to today), not stored in DB.

**Required change**: add `changePct: number | null` (per L4 lesson — DB-backed nullable values should accept null in signatures).

---

### 4. `refreshPricesForTickers` — `src/lib/prices.ts:6-46`

Three paths that construct `PriceData` objects:

| Path                         | Line | Currently sets                                                            |
| ---------------------------- | ---- | ------------------------------------------------------------------------- |
| Fresh cache hit (today)      | 27   | `{ price, fetched_at, is_fresh: true }`                                   |
| Fresh Finnhub fetch + upsert | 37   | `{ price: quote, fetched_at, is_fresh: true }`                            |
| Stale cache fallback         | 39   | `{ price: cached.price, fetched_at: cached.fetched_at, is_fresh: false }` |

The upsert at line 34 writes `{ ticker, price, fetched_at }` — needs `change_pct` added.

**Required changes**:

- Cache hit path (line 27): read `change_pct` from the cached row and include it
- Fresh fetch path (lines 31-38): `fetchQuote` now returns `{ price, changePct }`, upsert `change_pct`, set `changePct` in result
- Stale fallback path (line 39): read `change_pct` from cached row and include it (may be null for pre-migration rows)

---

### 5. `computePositions` — `src/lib/portfolio.ts:97-147`

`PortfolioPosition` interface at lines 9-23. Current fields used by TickerTape:

- `ticker` (line 10) — displayed
- `currentPrice: number | null` (line 15) — displayed via `formatNum`
- `roiPct: number | null` (line 21) — computed at line 124: `((currentPrice - avgCost) / avgCost) * 100`

`roiPct` is computed from `avgCost` (position cost) — it is the user's personal gain/loss, **not** the market's daily move. It stays untouched.

**Required change**: add `changePct: number | null` to `PortfolioPosition`; in `computePositions` pass it through from `priceEntry?.changePct ?? null` (same pattern as `priceDate` at line 120).

---

### 6. TickerTape — `src/components/transactions/DashboardView.tsx:35-74`

Current filter and display:

```typescript
// filter (line 36-38)
const items = positions.filter(
  (p): p is PortfolioPosition & { currentPrice: number; roiPct: number } =>
    p.currentPrice !== null && p.roiPct !== null,
);

// display (lines 64-67)
<b>{p.ticker}</b>
{formatNum(p.currentPrice)}
<span style={{ color: p.roiPct >= 0 ? "#0a9d6e" : "#c41230" }}>
  {p.roiPct >= 0 ? "▲" : "▼"} {formatNum(Math.abs(p.roiPct))}%
</span>
```

**Required changes**:

- Filter: replace `roiPct !== null` with `changePct !== null` in the type guard
- Display: replace `p.roiPct` with `p.changePct` for colour, arrow, and value

The rest of the component (`PortfolioSection`, `TickerCard`) uses `roiPct` and `currentPrice` for position-level gain/loss — **those stay unchanged**. `changePct` is purely additive to the interface.

---

### 7. Data flow from `dashboard.astro`

`dashboard.astro:30` calls `refreshPricesForTickers` → result typed as `Record<string, PriceData>` → passed as `initialPrices` prop to `DashboardView` at line 73. No transformation here. Adding `changePct` to `PriceData` automatically flows through.

---

## Code References

| File                                            | Lines        | What changes                                                                   |
| ----------------------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| `supabase/migrations/<new>.sql`                 | new file     | `ALTER TABLE prices ADD COLUMN change_pct NUMERIC(8,4)`                        |
| `src/lib/finnhub.ts`                            | 34, 52, 55   | return type → `{ price; changePct } \| null`; cast includes `dp`               |
| `src/lib/portfolio.ts`                          | 3-7          | `PriceData` gets `changePct: number \| null`                                   |
| `src/lib/portfolio.ts`                          | 9-23         | `PortfolioPosition` gets `changePct: number \| null`                           |
| `src/lib/portfolio.ts`                          | ~120         | `computePositions` passes through `priceEntry?.changePct ?? null`              |
| `src/lib/prices.ts`                             | 15-39        | read/write `change_pct`; propagate into all three PriceData construction paths |
| `src/components/transactions/DashboardView.tsx` | 36-38, 64-67 | TickerTape filter + display swapped from `roiPct` → `changePct`                |

**Test fixtures** (no logic change, just fixture shape):

- `src/lib/portfolio.test.ts` — `priceData()` and `position()` builders need `changePct`
- `src/test/integration/prices.integration.test.ts` — assertion shapes for upserted/returned price rows

---

## Architecture Insights

1. **`is_fresh` is runtime-computed, not stored** — `fetched_at` date vs `today` check in `prices.ts:26`. `changePct` follows the opposite pattern: it IS stored in the DB (computed once at fetch time, cached like `price`).

2. **`roiPct` is personal, `changePct` is market** — `roiPct` = `(currentPrice - avgCost) / avgCost` (user's cost basis). `changePct` = `dp` from Finnhub (market's daily move). They answer different questions and coexist without collision.

3. **Stale cache path returns nullable `changePct`** — pre-migration rows won't have `change_pct` in the DB. Nullable type on both DB column and `PriceData.changePct` handles this gracefully: the TickerTape simply hides tickers whose `changePct` is null.

4. **No new API calls** — all 60 req/min budget used only for `/quote` per ticker per day (unchanged). `dp` piggybacks on the existing call.

5. **`fetchQuote` signature change is a breaking internal API** — only caller is `prices.ts`. Update both atomically.

---

## Historical Context

- `context/archive/2026-06-09-portfolio-roi-view/` — Established `PriceData`, `PortfolioPosition`, `computePositions`, the `prices` table, and the daily-cache pattern. The `fetchQuote → prices table → PriceData → computePositions` pipeline is mature.
- `context/archive/2026-06-12-price-date-column/` — Added `priceDate` field: extracted `fetched_at` from `PriceData` into `PortfolioPosition`. Exact same pass-through pattern we'll use for `changePct`.
- `context/foundation/eod-api-decision.md` — Finnhub 60 req/min free tier. Confirms budget constraint; no new calls required by this change.

---

## Open Questions

1. **`dp === 0` on weekends** — Finnhub may return `dp: 0` for some symbols when the exchange is closed, which would appear as "flat" (▲ 0.00%) rather than null. Decision needed: treat `dp === 0` as null (hide from tape) or show it? Recommend treating `0` as valid — a genuinely flat day is rare but real.

2. **Migration timestamp** — Use the next available slot after `20260615000000`. Suggest `20260616000000_add_change_pct_to_prices.sql`.

3. **`change_pct` sign and `dp` sign** — Finnhub's `dp` is already a signed percent (negative = price fell). No transformation needed.
