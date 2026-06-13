# Sortable Portfolio Table Implementation Plan

## Overview

Add user-click column sorting to the portfolio holdings table. Seven of the ten data columns become sortable; three remain static (`Ticker`, `% of net liq`, `Price Date`). The table loads pre-sorted by `% of net liq` descending so largest positions appear first. All changes are confined to `src/components/transactions/DashboardView.tsx`.

## Current State Analysis

The portfolio table is a plain HTML `<table>` with hardcoded `<thead>` and `<tbody>` inside `DashboardView.tsx`. There is no sort state, no sort icons, and no click handlers on column headers. Positions are rendered directly from the `positions` useMemo result (line 61), which calls `computePositions()` on every transaction/price change.

Six of the ten `PortfolioPosition` fields are `number | null`: `currentPrice`, `positionValue`, `weightPct`, `roiPct`, `roiAbs`, and `priceDate` (non-sortable). The sort comparator must handle these without throwing.

## Desired End State

The table opens sorted by `weightPct` descending (largest positions first). Clicking any of the 7 sortable column headers sorts by that column descending on first click; clicking again toggles to ascending; clicking a different column resets to descending. Positions with a null value in the active sort column always sink to the bottom regardless of direction. Sortable-but-inactive headers show a neutral `ArrowUpDown` icon; the active sort header shows `ChevronDown` or `ChevronUp`. Non-sortable headers (`Ticker`, `% of net liq`, `Price Date`) show no icon and have no click interaction. Row clicks continue to open `LotsModal`.

### Key Discoveries

- `src/components/transactions/DashboardView.tsx:61` — `positions` useMemo has deps `[transactions, prices]`; sort must be a **separate** `useMemo` to avoid re-running `computePositions` on every user sort interaction.
- `src/components/transactions/DashboardView.tsx:151` — `<tbody>` currently maps over `positions`; this switches to `sortedPositions`.
- `src/components/transactions/DashboardView.tsx:137` — Ticker `<th>` is `sticky left-0 z-20`; this class must not be disturbed.
- `src/components/transactions/DashboardView.tsx:25` — Lucide import already pulls `ChevronRight` and `Loader2`; the three new icons extend this same import line.
- `src/lib/portfolio.ts:9-23` — `PortfolioPosition` fields for the 7 sortable columns: `totalShares` (number), `avgCost` (number), `currentPrice` (number | null), `costBasis` (number), `positionValue` (number | null), `roiAbs` (number | null), `roiPct` (number | null).

## What We're NOT Doing

- No sort persistence across page refreshes (no localStorage, no URL params).
- No sorting by `Ticker` (alphabetical) — excluded per spec.
- No column-config refactoring — headers and cells remain hardcoded in sync.
- No new utility files — everything stays in `DashboardView.tsx`.
- No keyboard navigation or ARIA sort attributes (out of scope for this slice).

## Implementation Approach

All five changes land in `DashboardView.tsx` in a single phase:

1. Extend the Lucide import.
2. Add sort type, sort state, and `sortedPositions` useMemo.
3. Add a `handleSortClick` helper.
4. Update the 7 sortable `<th>` elements (click handler + icon).
5. Switch `<tbody>` to consume `sortedPositions`.

The existing `positions` useMemo remains untouched — sort is a pure UI concern layered on top of the computed data.

## Critical Implementation Details

**Null-to-bottom comparator**: The comparator must check for `null` **before** applying the direction multiplier. When both values are null, return 0. When only one is null, always return such that the null side sorts last — independent of `sortDir`. This prevents null positions jumping to the top on ascending sort.

---

## Phase 1: Sortable table — state, comparator, click handlers, icons

### Overview

Add sort state and a sorted positions memo, wire click handlers to the 7 sortable column headers, and render sort direction icons. The change ships as one coherent unit because the state, data, and UI are all interdependent within a single file.

### Changes Required

#### 1. Lucide import extension

**File**: `src/components/transactions/DashboardView.tsx` (line 25)

**Intent**: Add the three sort indicator icons to the existing Lucide import so they are available to the header cells.

**Contract**: Extend the existing import line to include `ArrowUpDown`, `ChevronUp`, `ChevronDown` alongside the current `ChevronRight` and `Loader2`.

---

#### 2. Sort type, sort state, and `sortedPositions` memo

**File**: `src/components/transactions/DashboardView.tsx` (after line 63, below the existing useMemo block)

**Intent**: Define the `SortKey` type, initialize sort state to the default (`weightPct` / `desc`), and derive a sorted copy of `positions` for rendering — without re-running `computePositions`.

**Contract**:
- `SortKey` — a string union of the 8 keys that can appear as the active sort: the 7 user-sortable field names plus `"weightPct"` (used only for the initial default; user clicks can never set it back).
- `const [sortKey, setSortKey] = useState<SortKey>("weightPct")` — initialized to default.
- `const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")` — initialized to default.
- `sortedPositions` useMemo: deps `[positions, sortKey, sortDir]`; returns a shallow copy of `positions` sorted by the active `sortKey` and `sortDir`. Null-safe comparator: if both values are null → 0; if only one is null → that position always goes last, regardless of `sortDir`; otherwise compare numerically and flip sign for descending.

---

#### 3. `handleSortClick` function

**File**: `src/components/transactions/DashboardView.tsx` (inside the component, before the return)

**Intent**: Centralise the sort toggle logic so each `<th>` only passes its column key, without duplicating the "same column → toggle direction / new column → descending" logic inline seven times.

**Contract**: `function handleSortClick(key: Exclude<SortKey, "weightPct">): void` — if `key === sortKey`, toggle `sortDir` between `"asc"` and `"desc"`; otherwise call `setSortKey(key)` and `setSortDir("desc")`.

---

#### 4. Seven sortable `<th>` elements

**File**: `src/components/transactions/DashboardView.tsx` (lines 139–146 — the 7 sortable headers inside `<thead>`)

**Intent**: Make each sortable column header interactive and show the appropriate sort icon to communicate state to the user.

**Contract**: For each of the 7 columns (`Shares`, `Avg. Price`, `Current Price`, `Cost basis`, `Market value`, `Unrealized P&L`, `Unrealized P&L %`):
- Add `cursor-pointer select-none` to the `className`.
- Add `onClick={() => handleSortClick(fieldKey)}` using the matching `PortfolioPosition` field name.
- After the label text, render inline: `ArrowUpDown` (small, muted gray) when this column is not the active `sortKey`; `ChevronDown` when it is active and `sortDir === "desc"`; `ChevronUp` when active and `sortDir === "asc"`.

Non-sortable headers (`Ticker` line 137, `% of net liq` line 138, `Price Date` line 142) receive **no changes**.

---

#### 5. `<tbody>` source switch

**File**: `src/components/transactions/DashboardView.tsx` (line 151)

**Intent**: Render the sorted order instead of the raw computed order.

**Contract**: Replace `positions.map` with `sortedPositions.map`. The map body and all cell content remain unchanged.

---

### Success Criteria

#### Automated Verification

- TypeScript check passes: `npm run typecheck`
- Lint passes: `npm run lint`

#### Manual Verification

- Table loads with the largest-`weightPct` position at the top; no sort icon appears on the `% of net liq` header.
- Clicking `Shares` sorts by shares descending on first click; a `ChevronDown` icon appears on that header.
- Clicking `Shares` again toggles to ascending; icon changes to `ChevronUp`.
- Clicking `Cost basis` sorts cost basis descending, resets `Shares` header to `ArrowUpDown`.
- A position with no `currentPrice` (displays "—") always appears at the bottom when sorted by `Current Price`, both ascending and descending.
- `Ticker`, `% of net liq`, and `Price Date` headers have no icon and no visible cursor change on hover.
- Clicking a table row still opens `LotsModal` for that ticker (regression check).
- Sticky `Ticker` column continues to work correctly when scrolling horizontally.

**Implementation Note**: After completing this phase and automated checks pass, pause for manual verification of the above before considering the change complete.

---

## Testing Strategy

### Manual Testing Steps

1. Open the dashboard with at least 3 positions that have price data and 1 position without.
2. Verify initial sort: largest `% of net liq` position is row 1.
3. Click `Shares` — confirm descending sort, `ChevronDown` on Shares header, `ArrowUpDown` on all other sortable headers.
4. Click `Shares` again — confirm ascending sort, `ChevronUp` icon.
5. Click `Market value` — confirm descending sort on market value, Shares header resets to `ArrowUpDown`.
6. Click `Current Price` — confirm the position with no price data (showing "—") is always last, in both ascending and descending.
7. Click `Ticker`, `% of net liq`, `Price Date` headers — confirm nothing happens, no cursor change.
8. Click any row — confirm `LotsModal` opens for the correct ticker.
9. Add a new transaction — confirm the table re-sorts correctly after the new position appears.

## References

- Research: `context/changes/sortable-portfolio-table/research.md`
- Prior column additions: `context/archive/2026-06-13-portfolio-columns-rename-and-add/plan.md`
- Component: `src/components/transactions/DashboardView.tsx`
- Data type: `src/lib/portfolio.ts:9-23`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Sortable table — state, comparator, click handlers, icons

#### Automated

- [x] 1.1 TypeScript check passes: `npm run typecheck`
- [x] 1.2 Lint passes: `npm run lint`

#### Manual

- [x] 1.3 Table loads with largest-weightPct position at top; no sort icon on % of net liq header
- [x] 1.4 Clicking Shares sorts descending on first click, ChevronDown appears
- [x] 1.5 Clicking Shares again toggles to ascending, ChevronUp appears
- [x] 1.6 Clicking a different column resets previous column's icon to ArrowUpDown
- [x] 1.7 Null-priced position always appears at the bottom when sorting by Current Price (both directions)
- [x] 1.8 Non-sortable headers (Ticker, % of net liq, Price Date) show no icon and do nothing on click
- [x] 1.9 Row click still opens LotsModal for the correct ticker
- [x] 1.10 Sticky Ticker column works correctly during horizontal scroll
