# Portfolio ROI View — Plan Brief

> Full plan: `context/changes/portfolio-roi-view/plan.md`
> EOD API decision: `context/foundation/eod-api-decision.md`

## What & Why

Build the North Star feature of Pholio: the portfolio table showing each position's current EOD price and ROI (% and absolute value). This closes the full product loop — the user enters a transaction, a price is fetched, and they see their gain or loss. Without this, the app is just a transaction ledger with no insight.

## Starting Point

`DashboardView` already shows a 5-column table of individual transactions (Ticker, Shares, Purchase Price, Currency, Date). There is no price-fetching infrastructure, no aggregation by ticker, and no ROI calculation anywhere in the codebase. Finnhub has been selected as the EOD price provider (60 req/min free tier, documented API, Cloudflare Workers compatible).

## Desired End State

The user opens the dashboard and sees a 7-column portfolio table — one row per ticker — with: total shares, weighted average purchase price, current EOD price, total position value, ROI %, and ROI absolute. When Finnhub is unavailable, the last cached price is shown with a ⚠ indicator and date. Adding a new transaction immediately updates the aggregated row using the already-fetched prices.

## Key Decisions Made

| Decision                   | Choice                                                         | Why (1 sentence)                                                                             | Source |
| -------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| Table model                | Aggregated per-ticker (not per-transaction)                    | "Portfolio view" means positions, not individual buy orders; US-01 says "pozycje"            | Plan   |
| Price fallback             | DB cache (`prices` table)                                      | PRD explicitly requires "ostatnią zapisaną cenę" when API is down                            | Plan   |
| Fetch timing               | Server-side blocking in Astro frontmatter                      | Aligns with existing transaction-fetch pattern; no client loading state needed               | Plan   |
| Currency handling          | ROI only when all transactions for a ticker share one currency | Avoids mathematically incorrect USD/PLN comparisons; FR-009 is parked                        | Plan   |
| Cache schema               | Separate global `prices` table (ticker PK)                     | Public market data — no per-user isolation needed; one write per ticker, not per transaction | Plan   |
| Timeout                    | 2.5s per Finnhub call via AbortController                      | Keeps worst-case page time under the 3s NFR budget                                           | Plan   |
| Today's cache optimization | Skip Finnhub if `fetched_at` date = today                      | Prevents redundant API calls on repeat visits within the same day                            | Plan   |

## Scope

**In scope:**

- `prices` Supabase table (new migration)
- `FINNHUB_API_KEY` env var declaration in `astro.config.mjs`
- `src/lib/finnhub.ts` — `fetchQuote` with 2.5s timeout
- `src/lib/portfolio.ts` — `PriceData`, `PortfolioPosition` types, `computePositions` pure function
- `dashboard.astro` — price fetching + caching + pass `initialPrices` to `DashboardView`
- `DashboardView.tsx` — new `initialPrices` prop, 7-column portfolio table, ROI colouring, stale indicator

**Out of scope:**

- Currency conversion (FR-009 parked)
- Real-time prices (EOD only, per PRD)
- Edit/delete portfolio rows (S-04)
- Sector allocation chart (S-05)
- Per-user price isolation (prices are public data)
- Manual price refresh button

## Architecture / Approach

```
dashboard.astro (server-side)
  ├── fetch transactions from Supabase (existing)
  ├── read today's cached prices from `prices` table
  ├── Promise.allSettled: fetchQuote() for cache-miss tickers (2.5s timeout each)
  ├── upsert successful Finnhub results → `prices` table
  └── pass initialTransactions + initialPrices → DashboardView

DashboardView (React client)
  ├── useMemo: computePositions(transactions, prices) → PortfolioPosition[]
  ├── renders 7-column portfolio table
  └── add-transaction optimistic update → recomputes positions with static prices
```

## Phases at a Glance

| Phase                       | What it delivers                       | Key risk                                                                           |
| --------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| 1. DB migration             | `prices` table in Supabase with RLS    | Must be applied before any price caching code runs                                 |
| 2. Finnhub client + env     | `fetchQuote` function + env key wired  | Missing key silently degrades (returns null) — must verify key is set in prod      |
| 3. Dashboard price fetching | Prices fetched, cached, passed to view | Timeout logic must not block render beyond 3s; TypeScript will error until Phase 4 |
| 4. Portfolio table UI       | 7-column table, ROI, stale indicator   | Most complex phase — new table shape, ROI colouring, stale UX                      |

**Prerequisites:** Finnhub API key obtained; Supabase project accessible for migration; S-02 (add-transaction) complete — confirmed done.
**Estimated effort:** ~2-3 sessions across 4 phases.

## Open Risks & Assumptions

- Finnhub returns prices in the ticker's native currency with no currency field in the response. The plan assumes the quote currency matches the transaction currency — correct for US equities in USD; may produce misleading ROI for non-USD tickers (low risk for the primary persona).
- Finnhub `c` field returns the last traded price, which is effectively EOD after market close but may be intraday during market hours. Acceptable per PRD (EOD is the product intent; slight intraday variation is a non-issue for long-term investors).
- The `prices` table is writable by any authenticated user — a bad actor could corrupt cached prices for other users. For a solo-use MVP this is a non-issue; harden in v2 if multi-user scope expands.

## Success Criteria (Summary)

- Logged-in user sees a 7-column portfolio table with correct ROI for each ticker
- ROI is mathematically verifiable: `(current_price − avg_cost) / avg_cost × 100%`
- When Finnhub is unreachable, stale cached prices are shown with ⚠ — no crash, no blank table
