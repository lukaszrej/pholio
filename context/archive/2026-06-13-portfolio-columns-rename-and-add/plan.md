# Portfolio Table — Add Cost Basis & % of Net Liq Columns, Rename Value Labels

## Overview

Four targeted UI changes: rename two existing value labels and add two new columns to the portfolio positions table. All changes are purely presentational — no backend, no type system, no database changes.

## Current State Analysis

`DashboardView.tsx` renders a hardcoded HTML `<table>` with 9 columns (Ticker, Shares, Avg. Price, Current Price, Price Date, Value, Unrealized P&L, Unrealized P&L %, action). Column headers are static `<th>` elements; no config array exists. Both `positions: PortfolioPosition[]` and `portfolioSummary: PortfolioSummary` are already computed via `useMemo` at `DashboardView.tsx:61–63` and in scope at the table render site.

`PortfolioSummaryCard.tsx` shows three summary stats in a grid; "Current Value" is one of them (line 29).

## Desired End State

Portfolio table has two new columns and two renamed headers:

| Index | Header | Status |
|-------|--------|--------|
| 0 | Ticker (sticky) | unchanged |
| 1 | **% of net liq** | **NEW** |
| 2 | Shares | shifted |
| 3 | Avg. Price | shifted |
| 4 | Current Price | shifted |
| 5 | Price Date | shifted |
| 6 | **Cost basis** | **NEW** |
| 7 | **Market value** | renamed from "Value" |
| 8 | Unrealized P&L | shifted |
| 9 | Unrealized P&L % | shifted |
| 10 | (action) | shifted |

Portfolio summary card shows "Market value" instead of "Current Value". No cell values change — only labels and new columns appear.

**Verification:** Load the dashboard with at least one priced position. Confirm the column order above appears in the table header. Confirm "Market value" appears in the summary card. Confirm `% of net liq` values for all priced positions sum to approximately 100%.

### Key Discoveries

- `pos.avgCost` (`number`) and `pos.totalShares` (`number`) are both non-nullable — `costBasis = pos.avgCost * pos.totalShares` needs no null guard.
- `pos.positionValue: number | null` and `portfolioSummary.currentValue: number | null` both need null guards for the `% of net liq` computation.
- `portfolioSummary` is already in scope where the table is rendered (`DashboardView.tsx:63`) — no prop threading needed.
- `formatSigned` is wrong for `% of net liq` (adds mandatory `+/-` sign) — use plain `.toFixed(2) + "%"`.
- The established new-column pattern: add one `<th>` in `<thead>` at the matching index, add one `<td>` in the `<tbody>` row at the same index (`context/archive/2026-06-12-price-date-column`).

## What We're NOT Doing

- Not adding `costBasis` or `pctOfNetLiq` fields to `PortfolioPosition` or `PortfolioSummary`
- Not changing `portfolio.ts` or any calculation logic
- Not adding database migrations
- Not adding currency suffixes to the Cost basis cell
- Not adding sort, filter, or tooltip functionality to new columns

## Implementation Approach

Two phases ordered by risk. Phase 1 contains pure text renames — zero logic, zero risk of breakage. Phase 2 adds new column markup using inline expressions consistent with existing cell patterns. Each phase independently type-checks and lints clean before proceeding.

---

## Phase 1: Rename Value Labels

### Overview

Rename the "Value" column header and the "Current Value" summary label to "Market value" in both files. Cell values and all other markup are untouched.

### Changes Required

#### 1. Rename "Value" column header

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Change the `<th>` text at line 142 from "Value" to "Market value" so the column name reflects its content (current market price × shares).

**Contract**: Replace the `<th>` inner text only; class attributes are unchanged.

#### 2. Rename "Current Value" summary label

**File**: `src/components/portfolio/PortfolioSummaryCard.tsx`

**Intent**: Change the label text at line 29 from "Current Value" to "Market value" to match the new column name and terminology.

**Contract**: Replace only the inner text of the `<p>` label element; the `className` is unchanged.

### Success Criteria

#### Automated Verification

- TypeScript typecheck passes: `npm run typecheck`
- Lint passes: `npm run lint`

#### Manual Verification

- The portfolio table column previously labelled "Value" now reads "Market value"
- The portfolio summary card previously labelled "Current Value" now reads "Market value"
- All cell values are unchanged — numbers in both places are the same as before

**Implementation Note**: After all automated checks pass, confirm the two label changes manually in the running UI before proceeding to Phase 2.

---

## Phase 2: Add % of Net Liq and Cost Basis Columns

### Overview

Add two new columns to the portfolio table. "% of net liq" is inserted after the Ticker column (index 1); "Cost basis" is inserted just before "Market value" (index 6). One matching `<th>` + `<td>` pair is added per new column in the existing `<table>` structure.

### Changes Required

#### 1. Add "% of net liq" column header

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Insert a `<th>` for "% of net liq" immediately after the Ticker `<th>` (currently line 137) so it becomes column index 1.

**Contract**: New `<th>` uses the same `className="px-4 py-3 font-medium"` as all other non-sticky headers.

#### 2. Add "Cost basis" column header

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Insert a `<th>` for "Cost basis" immediately before the (now renamed) "Market value" `<th>` so it becomes column index 6.

**Contract**: Same `className="px-4 py-3 font-medium"` as other non-sticky headers.

#### 3. Add "% of net liq" cell

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Insert a `<td>` for "% of net liq" immediately after the Ticker `<td>` (lines 157–158) in every row. The value is the position's current market value as a percentage of the portfolio's total market value.

**Contract**: Both operands are nullable; show "—" when either is null. Formula and format:

```tsx
<td className="px-4 py-3">
  {pos.positionValue !== null && portfolioSummary.currentValue !== null
    ? ((pos.positionValue / portfolioSummary.currentValue) * 100).toFixed(2) + "%"
    : "—"}
</td>
```

#### 4. Add "Cost basis" cell

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Insert a `<td>` for "Cost basis" immediately before the "Market value" `<td>` (currently line 169) in every row. Cost basis is the total amount paid for all shares of the ticker: `avgCost × totalShares`.

**Contract**: Both `avgCost` and `totalShares` are always `number` (non-nullable), so no null guard is needed. No currency suffix (mirrors the Market value cell).

```tsx
<td className="px-4 py-3">{(pos.avgCost * pos.totalShares).toFixed(2)}</td>
```

### Success Criteria

#### Automated Verification

- TypeScript typecheck passes: `npm run typecheck`
- Lint passes: `npm run lint`

#### Manual Verification

- "% of net liq" appears as the second column (immediately after Ticker, before Shares)
- For rows with a known current price, "% of net liq" shows `X.XX%` (two decimal places)
- For rows without a current price (`positionValue` is null), "% of net liq" shows "—"
- The `% of net liq` values for all priced rows sum to approximately 100%
- "Cost basis" appears immediately before "Market value"
- "Cost basis" shows `avgCost × totalShares` to 2 decimal places, no currency suffix
- Columns Shares, Avg. Price, Current Price, Price Date, Unrealized P&L, Unrealized P&L % display correctly and are not shifted or duplicated

---

## Testing Strategy

### Manual Testing Steps

1. Start the dev server: `npm run dev`
2. Log in and navigate to the dashboard with at least one position that has a known price and one without (or force a null price by temporarily disabling the price cache)
3. Verify Phase 1: column header and summary card label both read "Market value"
4. Verify Phase 2 "% of net liq": priced rows show a percentage; unpriced rows show "—"; sum of all percentages ≈ 100%
5. Verify Phase 2 "Cost basis": each row shows `avgCost × totalShares` (cross-check manually against Avg. Price × Shares for one position); no currency suffix
6. Verify no column is duplicated or out of order

## References

- Research: `context/changes/portfolio-columns-rename-and-add/research.md`
- Portfolio table: `src/components/transactions/DashboardView.tsx:135–181`
- Portfolio summary card: `src/components/portfolio/PortfolioSummaryCard.tsx:29`
- Calculation library: `src/lib/portfolio.ts:9–21` (`PortfolioPosition`), `:29–37` (`PortfolioSummary`)
- Prior column-add pattern: `context/archive/2026-06-12-price-date-column/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Rename Value Labels

#### Automated

- [x] 1.1 TypeScript typecheck passes (`npm run typecheck`) — b53a709
- [x] 1.2 Lint passes (`npm run lint`) — b53a709

#### Manual

- [x] 1.3 "Value" column header now reads "Market value" in the UI — b53a709
- [x] 1.4 "Current Value" summary label now reads "Market value" in the UI — b53a709
- [x] 1.5 All cell values are unchanged — b53a709

### Phase 2: Add % of Net Liq and Cost Basis Columns

#### Automated

- [x] 2.1 TypeScript typecheck passes (`npm run typecheck`) — 173077a
- [x] 2.2 Lint passes (`npm run lint`) — 173077a

#### Manual

- [x] 2.3 "% of net liq" appears as second column (after Ticker, before Shares); shows `X.XX%` for priced rows, "—" for unpriced — 173077a
- [x] 2.4 Sum of all "% of net liq" values for priced rows ≈ 100% — 173077a
- [x] 2.5 "Cost basis" appears immediately before "Market value"; shows `avgCost × totalShares` to 2 decimals, no currency suffix — 173077a
- [x] 2.6 Existing columns (Shares, Avg. Price, Current Price, Price Date, Unrealized P&L, Unrealized P&L %) are correct and unaffected — 173077a
