# Portfolio Table — Add Cost Basis & % of Net Liq Columns, Rename Value Labels — Plan Brief

> Full plan: `context/changes/portfolio-columns-rename-and-add/plan.md`
> Research: `context/changes/portfolio-columns-rename-and-add/research.md`

## What & Why

Add two new columns to the portfolio positions table ("Cost basis" and "% of net liq") and rename two existing labels ("Value" → "Market value" in the table, "Current Value" → "Market value" in the summary card). The changes give users allocation and cost context directly in the table row, without requiring them to cross-reference the summary or calculate manually.

## Starting Point

The portfolio table has 9 columns (Ticker, Shares, Avg. Price, Current Price, Price Date, Value, Unrealized P&L, Unrealized P&L %, action), all hardcoded as JSX `<th>`/`<td>` pairs in `DashboardView.tsx`. The `PortfolioPosition` type already carries `avgCost` and `totalShares` (both non-nullable numbers); `portfolioSummary.currentValue` is already in scope in the component. No new computations need to go into `portfolio.ts`.

## Desired End State

The table has 11 columns. "% of net liq" (position market value ÷ portfolio market value, 2 decimal places) appears at index 1 (right after Ticker). "Cost basis" (`avgCost × totalShares`, no currency suffix) appears at index 6 (just before "Market value"). Both renamed labels read "Market value" in the table and summary card. Percentages for all priced positions sum to ≈ 100%.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| % of net liq numerator | Position market value (`positionValue`) | Standard brokerage definition — shows how much of total portfolio value is tied up in each ticker | Plan |
| Cost basis currency suffix | None | Match the existing Market value cell pattern (no suffix at DashboardView:169) | Plan |
| % of net liq precision | 2 decimal places | Consistent with the rest of the table (`.toFixed(2)` convention) | Plan |
| Type system changes | None | `avgCost` and `totalShares` are already non-nullable; `portfolioSummary` is in scope; inline arithmetic is the established pattern | Research |
| New columns location in `portfolio.ts` | Not added | All values derivable inline; no reason to add to `PortfolioPosition` interface | Research |

## Scope

**In scope:**
- Rename `<th>` "Value" → "Market value" (`DashboardView.tsx:142`)
- Rename label "Current Value" → "Market value" (`PortfolioSummaryCard.tsx:29`)
- Add "% of net liq" `<th>` + `<td>` after Ticker column
- Add "Cost basis" `<th>` + `<td>` before Market value column

**Out of scope:**
- Changes to `portfolio.ts`, `PortfolioPosition`, or `PortfolioSummary`
- Database migrations
- Currency suffix on Cost basis
- Sort, filter, or tooltip functionality for new columns

## Architecture / Approach

Pure UI layer. All new data is computed inline in `DashboardView.tsx` from already-available local variables (`pos.avgCost`, `pos.totalShares`, `pos.positionValue`, `portfolioSummary.currentValue`). The `<thead>`/`<tbody>` pair in `DashboardView` is updated symmetrically — one `<th>` and one matching `<td>` per new column. `PortfolioSummaryCard` gets a one-word text change.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Rename Value Labels | Both files updated; "Market value" appears in table header and summary card | Near zero — pure text changes |
| 2. Add New Columns | "% of net liq" and "Cost basis" appear in correct positions with correct values | Null guard on `positionValue` / `currentValue` must be correct; column ordering in `<thead>` and `<tbody>` must stay in sync |

**Prerequisites:** None — all required data is already computed and in scope  
**Estimated effort:** ~1 session, 2 phases

## Open Risks & Assumptions

- If `portfolioSummary.currentValue` is null (no positions have known prices), all "% of net liq" cells will show "—" — this is correct behavior, not a bug.
- The `<thead>`/`<tbody>` column order must remain in sync manually; a mismatch would shift all columns visually without a type error.

## Success Criteria (Summary)

- Both "Market value" labels appear in the running UI (table header + summary card)
- "% of net liq" values for all priced rows sum to ≈ 100%; unpriced rows show "—"
- "Cost basis" matches `Avg. Price × Shares` for any single-lot position
