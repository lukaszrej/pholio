# WatchlistPanel: Live Finnhub Quotes — Plan Brief

> Full plan: `context/changes/watchlist-live-quotes/plan.md`
> Research: `context/changes/watchlist-live-quotes/research.md`

## What & Why

Replace the hardcoded `MOCK_QUOTES` and random `fetchQuote()` in `WatchlistPanel.tsx` with real Finnhub market data. Because Finnhub's free tier is capped at 60 req/min, quotes are routed through a server-side endpoint that reuses the existing Supabase daily price cache — so portfolio/watchlist ticker overlap costs zero extra API calls.

## Starting Point

The watchlist is a fully client-side React component that fabricates prices (a 10-entry mock table plus random number generation for unknown tickers) and persists the full quote objects to `localStorage`. The repo already has a server-only Finnhub client (`fetchQuote`/`fetchSector`), a same-day `prices` cache, and a 7-day `sectors` cache — but `fetchQuote` discards OHLC fields and `fetchSector` discards company names, and the panel has no way to reach server-only code.

## Desired End State

The dashboard "All" tab shows the watchlist with live price, day change, % change, day range, and previous close for default and user-added tickers. Quotes load via a skeleton state, a bad symbol fails gracefully without blanking the list, and reloading re-fetches fresh data instead of showing stale persisted prices. No mock data remains.

## Key Decisions Made

| Decision            | Choice                                  | Why (1 sentence)                                                        | Source   |
| ------------------- | --------------------------------------- | ----------------------------------------------------------------------- | -------- |
| OHLC caching        | Extend `prices` table with OHLC columns | Zero extra Finnhub calls for cached tickers; single source of truth     | Plan     |
| Company name source | Add `name` column to `sectors` table    | `/stock/profile2` already returns it during sector refresh — free       | Plan     |
| localStorage model  | Tickers + order only                    | Eliminates the stale-price bug; always fetch fresh                      | Plan     |
| Refresh trigger     | On mount + on add                       | Matches same-day cache TTL; polling would return identical data         | Plan     |
| Loading UX          | Skeleton rows                           | Preserves grid layout, no jump                                          | Plan     |
| Endpoint behavior   | Batch, tolerate partial failures        | One bad ticker can't blank the list; mirrors existing `allSettled` flow | Plan     |
| Auth                | Required                                | Consistent with existing `prices` RLS                                   | Research |

## Scope

**In scope:** SQL migration (OHLC on `prices`, `name` on `sectors`); extend `fetchQuote`/`fetchProfile`; extend `PriceData` + `refreshPricesForTickers`; extract sector refresh into `src/lib/sectors.ts`; new `GET /api/watchlist/quotes`; rewrite `WatchlistPanel` (fetch, persistence, skeleton, error UX); test updates.

**Out of scope:** intraday polling / auto-refresh; manual refresh button; new profiles/watchlist tables; anonymous access; sector-chart behavior change; client data library.

## Architecture / Approach

Bottom-up. The data layer is widened so both caches carry the extra fields at no added call cost. A new batch endpoint composes `refreshPricesForTickers` (OHLC) + `refreshSectorsForTickers` (names) and returns a per-ticker map, omitting failures. The client panel fetches that endpoint on mount/add, persists only tickers, and renders skeletons then live rows. Data flow: `WatchlistPanel → GET /api/watchlist/quotes → prices/sectors cache (→ Finnhub on miss)`.

## Phases at a Glance

| Phase            | What it delivers                                                                  | Key risk                                                          |
| ---------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1. Data layer    | Migration + Finnhub OHLC/name extraction + cache helpers + extracted `sectors.ts` | Sector-refresh extraction must not change dashboard output        |
| 2. API endpoint  | Batched, auth-gated, partial-failure-tolerant `/api/watchlist/quotes`             | Input validation + correct cache reuse                            |
| 3. Panel rewrite | Live fetch, tickers-only persistence, skeleton + error UX                         | localStorage legacy-shape migration; per-ticker failure rendering |

**Prerequisites:** Local Supabase to apply the migration; a valid `FINNHUB_API_KEY` for manual verification.
**Estimated effort:** ~3 sessions, one per phase.

## Open Risks & Assumptions

- `fetchSector → fetchProfile` signature change touches `dashboard.astro`; both must change together to keep typecheck green.
- Legacy `localStorage` values are full `WatchItem[]`; the reader must tolerate that shape.
- Assumes Finnhub `/quote` reliably returns `d,h,l,o,pc` for valid symbols (guarded as `null` otherwise).

## Success Criteria (Summary)

- "All" tab shows live, correct quotes for default and added tickers, loaded via skeletons.
- A bogus ticker fails gracefully; valid tickers are unaffected.
- Reload preserves the ticker list/order but shows fresh prices — never stale persisted ones.
