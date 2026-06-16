# Ticker Tape Daily % Change — Plan Brief

> Full plan: `context/changes/ticker-tape-daily-change/plan.md`
> Research: `context/changes/ticker-tape-daily-change/research.md`

## What & Why

The ticker tape currently shows each position's personal gain/loss (`roiPct`, based on the user's cost basis). The user wants it to show the **market's daily percentage change** instead — ticker · price · daily % move. Finnhub's `/quote` endpoint already returns this value (`dp`), and we already call `/quote` for every ticker, so this is achievable with **zero additional API calls** (staying within the 60 req/min free tier).

## Starting Point

Today `fetchQuote` (`finnhub.ts:55`) returns only the current price `c`, discarding `dp`. Prices are cached in a Supabase `prices` table (`ticker`, `price`, `fetched_at`) and threaded through `PriceData → computePositions → PortfolioPosition → TickerTape`. The tape filters to positions with non-null `currentPrice` and `roiPct` and renders a colored `roiPct` badge.

## Desired End State

The tape shows symbol · price · colored daily % change (green ▲ / red ▼) for each held ticker. Tickers whose daily change isn't yet cached still appear as symbol · price with no badge. `roiPct` keeps driving the gain/loss columns in `PortfolioSection` and `TickerCard` — untouched.

## Key Decisions Made

| Decision                 | Choice                                                             | Why                                                   | Source   |
| ------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------- | -------- |
| Data source              | Finnhub `dp` from existing `/quote` call                           | No new API calls; respects 60 req/min budget          | Research |
| Storage                  | New nullable `change_pct NUMERIC(8,4)` column, cached like `price` | Mirrors `priceDate` precedent; nullable per lesson L4 | Research |
| Null `changePct` in tape | Show price only, drop the % badge                                  | Every held ticker stays visible during backfill gap   | Plan     |
| `dp === 0`               | Treat as valid flat day (`0.00%`)                                  | A flat day is real data; don't conflate with missing  | Plan     |
| Backfill of cached rows  | Let `change_pct` populate naturally on next daily refresh          | No extra code or API calls                            | Plan     |
| `roiPct`                 | Leave in place everywhere except the tape                          | It's a different metric (cost-basis return)           | Research |

## Scope

**In scope:** `change_pct` migration; `fetchQuote` returns `{ price, changePct }`; `prices.ts` persists/propagates it; `changePct` added to `PriceData` & `PortfolioPosition`; `computePositions` pass-through; TickerTape filter + display swap; test fixture updates.

**Out of scope:** new API calls; touching `roiPct` outside the tape; forced backfill; storing other quote fields; making `changePct` sortable or adding it to portfolio tables.

## Architecture / Approach

Bottom-up pipeline extension so types stay consistent at each layer: DB column → `fetchQuote` signature → `prices.ts` propagation (all 3 PriceData paths) → `PriceData`/`PortfolioPosition` types → `computePositions` → test fixtures (Phase 1, no visible change), then the isolated TickerTape UI swap (Phase 2). `fetchQuote`'s signature change is internal — only caller is `prices.ts`.

## Phases at a Glance

| Phase                    | What it delivers                                                                                       | Key risk                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 1. Data pipeline + types | `dp` cached in `change_pct` and threaded to `PortfolioPosition.changePct`; tests green; tape unchanged | Test fixtures / integration stub must include the new field or suite breaks |
| 2. TickerTape UI swap    | Tape shows daily % change; price-only fallback for null                                                | Filter relaxation must not hide tickers that have a price but no change     |

**Prerequisites:** Supabase migration must be applied (locally and in deployed env) for `change_pct` to persist.
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- Until each ticker's daily cache expires and re-fetches, legacy rows return `null` `change_pct` and render price-only — the tape may be sparse on the change badge for up to a trading day after deploy.
- Assumes Finnhub's `dp` is a signed percent already (negative = down); no transformation needed.

## Success Criteria (Summary)

- Tape percentages match the market's daily move, not the user's position return.
- A ticker with no cached daily change still shows its price (no broken row).
- No regression in the `PortfolioSection` / `TickerCard` gain/loss columns.
