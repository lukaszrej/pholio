---
date: 2026-06-13T00:00:00+00:00
researcher: Claude Sonnet 4.6
git_commit: b81dec8a2179c962f8585a25bb58219912730823
branch: main
repository: pholio
topic: "Portfolio table: add Cost basis and % of net liq columns, rename value labels"
tags: [research, codebase, portfolio, DashboardView, PortfolioSummaryCard, portfolio.ts]
status: complete
last_updated: 2026-06-13
last_updated_by: Claude Sonnet 4.6
---

# Research: Portfolio table column additions and renames

**Date**: 2026-06-13  
**Researcher**: Claude Sonnet 4.6  
**Git Commit**: b81dec8a2179c962f8585a25bb58219912730823  
**Branch**: main  
**Repository**: pholio

## Research Question

Four changes to the portfolio table and summary:

1. Rename the "Value" column → "Market value"
2. Add a "Cost basis" column (before "Market value") — total cost of all shares for the ticker
3. Add a "% of net liq" column (after Ticker) — percentage of ticker's cost basis / market value relative to the whole portfolio's current market value
4. Rename "Current Value" in the portfolio summary header → "Market value"

## Summary

All four changes are confined to two UI files and one shared library. No database migrations are needed — cost basis is fully derivable from existing `PortfolioPosition` fields (`avgCost × totalShares`), and the portfolio's total market value is already available as `portfolioSummary.currentValue`. The new "% of net liq" column can be computed inline in the table row without touching `portfolio.ts`. The riskiest decision is the semantics of the "% of net liq" numerator (see Open Questions).

## Detailed Findings

### 1. Portfolio table — `DashboardView.tsx`

**File:** `src/components/transactions/DashboardView.tsx`

The table is a plain HTML `<table>` with hardcoded `<th>` and `<td>` elements. There is no column-config array or dynamic column rendering — every column is an explicit JSX node.

**Current column order (thead, lines 137–145):**

| Index | Header           | Line (th) | Cell line |
| ----- | ---------------- | --------- | --------- |
| 0     | Ticker           | 137       | 157–158   |
| 1     | Shares           | 138       | 160       |
| 2     | Avg. Price       | 139       | 161–164   |
| 3     | Current Price    | 140       | 165–167   |
| 4     | Price Date       | 141       | 168       |
| 5     | **Value**        | **142**   | **169**   |
| 6     | Unrealized P&L   | 143       | 170–172   |
| 7     | Unrealized P&L % | 144       | 173–176   |
| 8     | (action icon)    | 145       | 177–179   |

**"Value" header** (`DashboardView.tsx:142`):

```tsx
<th className="px-4 py-3 font-medium">Value</th>
```

**"Value" cell** (`DashboardView.tsx:169`):

```tsx
<td className="px-4 py-3">{pos.positionValue !== null ? pos.positionValue.toFixed(2) : "—"}</td>
```

**"Ticker" cell** (`DashboardView.tsx:157–158`) — sticky-positioned:

```tsx
<td className="sticky left-0 z-10 bg-white px-4 py-3 font-semibold group-hover:bg-gray-50">{pos.ticker}</td>
```

**Data source** (`DashboardView.tsx:61–63`):

```tsx
const positions = useMemo(() => computePositions(transactions, prices), [transactions, prices]);
const sectorSlices = useMemo(() => computeSectorAllocation(positions, sectors), [positions, sectors]);
const portfolioSummary = useMemo(() => computePortfolioSummary(positions), [positions]);
```

Both `positions` (array) and `portfolioSummary` are already in scope where the table is rendered — no prop drilling needed for the new "% of net liq" column.

---

### 2. Portfolio summary card — `PortfolioSummaryCard.tsx`

**File:** `src/components/portfolio/PortfolioSummaryCard.tsx`

Displays three summary stats in a 3-column grid. The "Current Value" label is at:

**Label** (`PortfolioSummaryCard.tsx:29`):

```tsx
<p className="mb-1 text-xs tracking-wide text-gray-500 uppercase">Current Value</p>
```

**Value display** (`PortfolioSummaryCard.tsx:30–32`):

```tsx
<p className="text-xl font-semibold text-gray-800">
  {currentValue !== null ? `${currentValue.toFixed(2)}${currencyLabel}` : "—"}
</p>
```

`currentValue` is destructured from `summary: PortfolioSummary` (prop) at line 9.

---

### 3. Data model — `src/lib/portfolio.ts`

**`PortfolioPosition` interface** (`portfolio.ts:9–21`) — one row in the table:

```typescript
export interface PortfolioPosition {
  ticker: string;
  totalShares: number;
  avgCost: number; // weighted-average purchase price per share
  currency: string;
  hasMultipleCurrencies: boolean;
  currentPrice: number | null;
  isFresh: boolean;
  priceDate: string | null;
  positionValue: number | null; // currentPrice × totalShares
  roiPct: number | null;
  roiAbs: number | null;
}
```

**`PortfolioSummary` interface** (`portfolio.ts:29–37`):

```typescript
export interface PortfolioSummary {
  positionCount: number;
  totalInvested: number; // sum(avgCost × totalShares) — portfolio-level cost basis
  currentValue: number | null; // sum(positionValue) for all priced positions
  totalPnL: number | null;
  totalPnLPct: number | null;
  currency: string | null;
  excludedCount: number;
}
```

**`computePositions`** (`portfolio.ts:95–137`):

- Groups `Transaction[]` by ticker, then per ticker computes:
  - `totalShares = sum(t.shares)` (line 109)
  - `weightedSum = sum(t.shares × t.purchase_price)` (line 110) — this is the cost basis numerator
  - `avgCost = weightedSum / totalShares` (line 111)
  - `positionValue = currentPrice × totalShares` (line 119)
  - `roiAbs = (currentPrice - avgCost) × totalShares` (line 120)

**`computePortfolioSummary`** (`portfolio.ts:39–61`):

- `totalInvested = sum(p.avgCost × p.totalShares)` (line 42) — exact equivalent of cost basis
- `currentValue = sum(p.positionValue)` for positions with non-null `positionValue` (lines 44–47)

---

### 4. Cost basis derivation

There is **no `costBasis` field** in `PortfolioPosition` and no helper function. However, the value is fully derivable from existing fields:

```
costBasis (per ticker) = avgCost × totalShares
```

Both `avgCost` (`number`, never null) and `totalShares` (`number`, never null) are already in every `PortfolioPosition`. The cost basis can therefore be rendered inline in the table cell:

```tsx
<td className="px-4 py-3">{(pos.avgCost * pos.totalShares).toFixed(2)}</td>
```

No change to `PortfolioPosition` or `portfolio.ts` is needed for this column.

**Important lesson alignment (L4):** Since both fields are `number` (not `number | null`), no null-widening is required.

---

### 5. `% of net liq` derivation

The column denominator is the portfolio's total market value, which is `portfolioSummary.currentValue` (`number | null`).

The numerator is ambiguous (see Open Questions), but assuming standard "% of net liq" (position market value as % of total market value):

```
pctOfNetLiq = (pos.positionValue / portfolioSummary.currentValue) × 100
```

Both `pos.positionValue` and `portfolioSummary.currentValue` can be null, so the cell must guard:

```tsx
<td className="px-4 py-3">
  {pos.positionValue !== null && portfolioSummary.currentValue !== null
    ? ((pos.positionValue / portfolioSummary.currentValue) * 100).toFixed(2) + "%"
    : "—"}
</td>
```

Since `portfolioSummary` is already in scope at `DashboardView.tsx:63`, no changes to `portfolio.ts` or `PortfolioPosition` are needed.

---

### 6. Target column order after the change

| Index | Header           | Notes                              |
| ----- | ---------------- | ---------------------------------- |
| 0     | Ticker           | sticky — unchanged                 |
| **1** | **% of net liq** | NEW — inserted after Ticker        |
| 2     | Shares           | shifted                            |
| 3     | Avg. Price       | shifted                            |
| 4     | Current Price    | shifted                            |
| 5     | Price Date       | shifted                            |
| **6** | **Cost basis**   | NEW — inserted before Market value |
| **7** | **Market value** | renamed from "Value"               |
| 8     | Unrealized P&L   | shifted                            |
| 9     | Unrealized P&L % | shifted                            |
| 10    | (action icon)    | shifted                            |

---

### 7. Database schema (no changes needed)

**`transactions` table** (migration `20260604111725_create_transactions.sql`):

- Relevant columns: `ticker TEXT`, `purchase_price NUMERIC(15,4)`, `shares NUMERIC(15,4)`
- No `cost_basis` column exists; cost basis is computed in TypeScript from these two fields.

**`prices` table** (migration `20260609000000_create_prices.sql`):

- `ticker TEXT PK`, `price NUMERIC(15,4)`, `fetched_at TIMESTAMPTZ`
- Drives `positionValue` and `currentValue`.

No migration is required for this change.

## Code References

- `src/components/transactions/DashboardView.tsx:137–145` — `<thead>` with all column headers
- `src/components/transactions/DashboardView.tsx:142` — "Value" `<th>` to rename
- `src/components/transactions/DashboardView.tsx:149–181` — `<tbody>` row map with all cells
- `src/components/transactions/DashboardView.tsx:157` — Ticker `<td>` (sticky) — insert "% of net liq" `<td>` after this
- `src/components/transactions/DashboardView.tsx:169` — positionValue cell — insert "Cost basis" `<td>` before this; rename label
- `src/components/transactions/DashboardView.tsx:61–63` — `positions`, `sectorSlices`, `portfolioSummary` memos
- `src/lib/portfolio.ts:9–21` — `PortfolioPosition` interface
- `src/lib/portfolio.ts:29–37` — `PortfolioSummary` interface (note: `currentValue: number | null`)
- `src/lib/portfolio.ts:42` — `totalInvested` formula — mirrors per-ticker cost basis
- `src/lib/portfolio.ts:109–111` — `totalShares`, `weightedSum`, `avgCost` in `computePositions`
- `src/lib/portfolio.ts:119` — `positionValue = currentPrice × totalShares`
- `src/components/portfolio/PortfolioSummaryCard.tsx:29` — "Current Value" label to rename

## Architecture Insights

- **No column-config system.** Headers and cells are symmetric hardcoded JSX pairs. Adding a column means adding one `<th>` in the thead and one `<td>` in the same relative position in the tbody row. The two blocks must stay in sync manually.
- **Inline arithmetic is the pattern.** The codebase already uses `pos.positionValue.toFixed(2)` and `(currentPrice - avgCost) * totalShares` directly in cells. Adding `pos.avgCost * pos.totalShares` inline is consistent with this style; no helper function is warranted.
- **`portfolioSummary` is in scope.** The table and `portfolioSummary` share the same component (`DashboardView`). Feeding portfolio-level context down to rows requires no new prop or context — just use `portfolioSummary.currentValue` directly in the cell expression.
- **`positionValue` and `currentValue` are both `| null`.** The "% of net liq" cell must null-guard both operands; displaying "—" when either is null follows the existing pattern.

## Historical Context (from prior changes)

- `context/archive/2026-06-09-portfolio-roi-view/` — Established `computePositions` and the `PortfolioPosition` type. The `roiAbs`, `roiPct` fields were added here, along with the Unrealized P&L columns — same pattern as the new columns.
- `context/archive/2026-06-11-portfolio-summary-card/` — Introduced `PortfolioSummaryCard` and the "Current Value" / "Total Invested" / "Unrealized P&L" three-stat grid. The card reads from `PortfolioSummary`, not raw transactions.
- `context/archive/2026-06-12-price-date-column/` — Added the "Price Date" column following the same thead/tbody symmetric pattern. Confirms the "add a `<th>` + matching `<td>`" approach is the established convention for new columns.

## Open Questions

1. **"% of net liq" numerator — cost basis or market value?**  
   The user wrote "a percentage of cost basis and the market value of the whole portfolio." In finance, "% of net liq" is almost universally `positionValue / portfolioMarketValue × 100` (market value as numerator). However, the phrasing "of cost basis" could mean the numerator is `avgCost × totalShares` instead. Clarify before implementing:
   - **Option A (standard):** `positionValue / portfolioCurrentValue × 100`
   - **Option B (user may intend):** `(avgCost × totalShares) / portfolioCurrentValue × 100`

2. **Currency formatting for new columns.**  
   "Market value" (current "Value" cell, `DashboardView.tsx:169`) does **not** show a currency suffix — unlike "Avg. Price" which does. "Cost basis" is in the same currency unit (purchase currency), so it should probably follow the same pattern. Confirm whether the planner wants a currency suffix on either new column, or whether matching the existing "Value" cell (no suffix) is correct.

3. **"% of net liq" format.**  
   Should the percentage be shown as `12.34%` (toFixed(2) + "%"), `12.3%` (one decimal), or something else? The existing "Unrealized P&L %" column uses `formatSigned(pos.roiPct)` — check `src/lib/format.ts` for that helper's output format and decide whether to reuse it or use a simpler inline expression.
