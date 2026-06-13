---
date: 2026-06-13T08:18:01+00:00
researcher: claude-sonnet-4-6
git_commit: 29876056836f016b18c8d42652c10ff6935c9f60
branch: main
repository: Pholio
topic: "Sortable portfolio table — column structure, data types, sort patterns"
tags: [research, portfolio, table, sorting, DashboardView, PortfolioPosition]
status: complete
last_updated: 2026-06-13
last_updated_by: claude-sonnet-4-6
---

# Research: Sortable portfolio table

**Date**: 2026-06-13T08:18:01+00:00
**Researcher**: claude-sonnet-4-6
**Git Commit**: 29876056836f016b18c8d42652c10ff6935c9f60
**Branch**: main
**Repository**: Pholio

## Research Question

Make the portfolio table sortable by user-click on column headers. Default sort: "% of net liq" descending. Non-sortable columns (no click handler): "Ticker", "% of net liq", "Price date".

---

## Summary

The portfolio table lives entirely in `src/components/transactions/DashboardView.tsx` as a plain HTML `<table>` with hardcoded `<thead>` and `<tbody>`. There is no column-config array, no existing sort state, and no sort UI components. The data row type is `PortfolioPosition` (10 fields), computed in a `useMemo` that calls `computePositions()`. Six of the ten numeric/date fields are nullable (`number | null` or `string | null`), requiring null-safe comparators. Lucide React (already a dependency) provides `ChevronUp` / `ChevronDown` icons for sort indicators. The entire sort feature is self-contained to `DashboardView.tsx` — no schema changes and no new files are required.

---

## Detailed Findings

### Table component location and structure

- **File**: `src/components/transactions/DashboardView.tsx:134–188`
- The table is a plain semantic `<table>` — no column-config array; headers and cells are paired manually and must be kept in sync.
- Columns (in order):

| #   | Header label     | `PortfolioPosition` field | TypeScript type  | User-sortable? |
| --- | ---------------- | ------------------------- | ---------------- | -------------- |
| 1   | Ticker           | `ticker`                  | `string`         | **No**         |
| 2   | % of net liq     | `weightPct`               | `number \| null` | **No**         |
| 3   | Shares           | `totalShares`             | `number`         | Yes            |
| 4   | Avg. Price       | `avgCost`                 | `number`         | Yes            |
| 5   | Current Price    | `currentPrice`            | `number \| null` | Yes            |
| 6   | Price Date       | `priceDate`               | `string \| null` | **No**         |
| 7   | Cost basis       | `costBasis`               | `number`         | Yes            |
| 8   | Market value     | `positionValue`           | `number \| null` | Yes            |
| 9   | Unrealized P&L   | `roiAbs`                  | `number \| null` | Yes            |
| 10  | Unrealized P&L % | `roiPct`                  | `number \| null` | Yes            |
| 11  | _(action icon)_  | —                         | —                | No             |

- The Ticker `<th>` is sticky: `className="sticky left-0 z-20 bg-white px-4 py-3 font-medium"` (line 137).
- Row click handler (lines 154–157) opens `LotsModal` for the clicked ticker — this must be preserved.

### PortfolioPosition data type

- **File**: `src/lib/portfolio.ts:9–23`

```typescript
export interface PortfolioPosition {
  ticker: string;
  totalShares: number;
  avgCost: number;
  currency: string;
  hasMultipleCurrencies: boolean;
  currentPrice: number | null;
  isFresh: boolean;
  priceDate: string | null;
  costBasis: number;
  positionValue: number | null;
  weightPct: number | null;
  roiPct: number | null;
  roiAbs: number | null;
}
```

**Nullable fields** (require null-safe comparators, push nulls to end of sorted list):

- `currentPrice`, `positionValue`, `weightPct`, `roiPct`, `roiAbs` — all `number | null`
- `priceDate` — `string | null` (non-sortable per spec, but noted for completeness)

**Non-nullable numeric fields** (simple subtraction comparators work):

- `totalShares`, `avgCost`, `costBasis`

### Data flow into the table

```
Supabase transactions table
  → dashboard.astro: fetchTransactions() → Transaction[]
  → DashboardView props: initialTransactions, initialPrices, initialSectors
  → useState(initialTransactions) → transactions
  → useMemo: computePositions(transactions, prices) → PortfolioPosition[]  ← sort goes here or after
  → <tbody>: positions.map(pos => <tr>)
```

- **File**: `src/components/transactions/DashboardView.tsx:50–63` — state setup and memoization

The existing `positions` useMemo has deps `[transactions, prices]`. Sorting should be a **separate** `useMemo` with deps `[positions, sortKey, sortDir]` to avoid re-running `computePositions` on every sort interaction.

### State management and memoization pattern

- **File**: `src/components/transactions/DashboardView.tsx:61–63`

```typescript
const positions = useMemo(() => computePositions(transactions, prices), [transactions, prices]);
const sectorSlices = useMemo(() => computeSectorAllocation(positions, sectors), [positions, sectors]);
const portfolioSummary = useMemo(() => computePortfolioSummary(positions), [positions]);
```

The project uses plain `useState` + `useMemo`; no custom hooks for sort exist. A new sort state pair (`sortKey`, `sortDir`) and a `sortedPositions` useMemo follow this exact pattern.

### Existing sort patterns

The only sort patterns in the codebase are:

1. `src/lib/portfolio.ts:86` — sector slices sorted by value descending:

   ```typescript
   slices.sort((a, b) => b.value - a.value);
   ```

2. `src/components/transactions/LotsModal.tsx:18` — lots sorted by purchase date:
   ```typescript
   .sort((a, b) => a.purchase_date.localeCompare(b.purchase_date))
   ```

Both use direct inline `.sort()`. No sort utility functions, no sort hooks, no sort icons exist.

### Available icons

- **Lucide React v1.14.0** is already installed.
- `ChevronRight` is currently used in `DashboardView.tsx` (row action icon).
- `ChevronUp` and `ChevronDown` are used in `src/components/ui/select.tsx` — import pattern is established.
- These two icons are the correct choice for sort direction indicators.

### Format utilities

- **File**: `src/lib/format.ts`
  - `formatShares(n: number | null): string`
  - `formatSigned(value: number | null, decimals = 2): string`
  - `pnlClass(value: number | null): string`
- **File**: `src/components/transactions/DashboardView.tsx:35–48`
  - `formatCurrentPrice(pos)` — inline helper, returns "—" for null
  - `formatPriceDate(pos)` — inline helper, parses ISO string to "DD Mon"

---

## Code References

- `src/components/transactions/DashboardView.tsx:134–148` — `<thead>` with all column headers
- `src/components/transactions/DashboardView.tsx:150–186` — `<tbody>` row map
- `src/components/transactions/DashboardView.tsx:50–63` — state + useMemo setup
- `src/components/transactions/DashboardView.tsx:35–48` — inline format helpers
- `src/lib/portfolio.ts:9–23` — `PortfolioPosition` interface
- `src/lib/portfolio.ts:97–147` — `computePositions()` function
- `src/lib/format.ts` — shared format utilities
- `src/components/transactions/LotsModal.tsx:18` — existing sort pattern (localeCompare)
- `src/lib/portfolio.ts:86` — existing sort pattern (numeric descending)
- `src/components/ui/select.tsx` — example of ChevronUp/ChevronDown icon usage

---

## Architecture Insights

1. **No column-config system** — any change to column behavior must touch both `<thead>` and the matching `<td>` in `<tbody>`. The plan must keep these in sync.
2. **Sort lives in `DashboardView`, not in `computePositions`** — `computePositions` is a pure data function; sort order is a UI concern.
3. **Two-useMemo pattern**: `positions` (data computation) and `sortedPositions` (UI ordering) should be separate memos to avoid re-running expensive data transforms on UI interactions.
4. **Null-to-bottom convention**: Six fields are nullable. The sort comparator should treat `null` as lower than any real value (push to bottom on descending sort, push to top on ascending — but practically, positions without prices are "unknown" and should consistently appear at the bottom regardless of direction).
5. **Default sort key**: `weightPct` — the table is sorted by this column on mount, but the "% of net liq" column header itself is non-interactive (no click handler, no sort icon).
6. **Sticky Ticker column**: The `z-20` sticky class on the Ticker `<th>` (line 137) and `z-10` on the Ticker `<td>` (line 159) must be preserved during any header refactoring.
7. **Row click handler**: The `onClick={() => setSelectedTicker(pos.ticker)}` on each `<tr>` (lines 154–157) must coexist with the new header click handlers. These are on different elements so there is no conflict.

---

## Historical Context (from prior changes)

- `context/archive/2026-06-13-portfolio-columns-rename-and-add/` — Added "% of net liq" (`weightPct`) and "Cost basis" columns; renamed "Value" → "Market value". This is the direct predecessor; the column structure we are sorting was finalized here.
- `context/archive/2026-06-12-price-date-column/plan.md` — Established the manual `<th>` + `<td>` pairing pattern for column additions.
- `context/archive/2026-06-09-portfolio-roi-view/plan.md` — Established `computePositions()` and the `PortfolioPosition` data contract.

---

## Open Questions

1. **Null sort position**: Should null-valued positions consistently appear at the bottom regardless of sort direction (recommended), or should ascending sort push them to the top? Decision affects the sort comparator design.
2. **Sort persistence**: Should the sort state persist across page refreshes (localStorage), or is session-only acceptable? Likely session-only for now.
3. **Initial sort direction**: Default is `weightPct` descending (largest positions first). Is ascending the correct fallback when a user first clicks a sortable column, or should it toggle from the current direction?
