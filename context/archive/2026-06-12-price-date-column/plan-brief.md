# Price Date Column — Plan Brief

> Full plan: `context/changes/price-date-column/plan.md`

## What & Why

The portfolio table was showing a ⚠ triangle inside the Current Price cell whenever a price was stale. The triangle needs to be removed, and the price date needs its own dedicated column so users can see when any price was last fetched — not just stale ones.

## Starting Point

`DashboardView.tsx` has a `formatCurrentPrice()` helper that concatenates the price number, a warning triangle, and a date into a single string when `isFresh` is false. `PortfolioPosition` already exposes `priceDate` and `isFresh`, so no data layer changes are needed.

## Desired End State

The portfolio table has a "Price Date" column immediately after "Current Price". Every position with a known price shows the fetch date (e.g. "10 Jun") in that column. Stale dates render in muted grey; fresh dates in default colour. The Current Price cell shows a plain number only.

## Key Decisions Made

| Decision           | Choice                       | Why (1 sentence)                                          |
| ------------------ | ---------------------------- | --------------------------------------------------------- |
| Column position    | After Current Price          | Date is contextually tied to the price it qualifies       |
| Fresh price date   | Always show                  | Consistent column — no conditionally empty cells          |
| Stale date styling | Muted grey (`text-gray-400`) | Subtle signal without alarming the user                   |
| Date format        | DD Mon (e.g. "10 Jun")       | Matches existing date display in the transactions sub-row |

## Scope

**In scope:** `DashboardView.tsx` only — simplify `formatCurrentPrice`, add `formatPriceDate`, add `<th>` + `<td>`, bump `colSpan` 8 → 9.

**Out of scope:** Data model, API routes, mobile-specific column hiding, tooltips.

## Architecture / Approach

Pure UI change in a single component. No new components, no new state, no network calls.

## Phases at a Glance

| Phase                    | What it delivers                                        | Key risk                   |
| ------------------------ | ------------------------------------------------------- | -------------------------- |
| 1. Add Price Date column | Separate date column, clean price cell, correct colSpan | None — self-contained edit |

**Prerequisites:** None  
**Estimated effort:** ~1 session, 1 phase

## Open Risks & Assumptions

- Assumes `priceDate` is always an ISO timestamp parseable by `new Date()` — consistent with how `fetched_at` is stored.
- No stale-price rows may be available locally to test the grey styling; weekend/market-closed data needed.

## Success Criteria (Summary)

- "Price Date" column visible in the table, to the right of "Current Price"
- No ⚠ triangle anywhere in the table
- Expanded position rows still span the full table width
