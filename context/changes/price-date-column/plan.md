# Price Date Column Implementation Plan

## Overview

Add a dedicated "Price Date" column to the portfolio table that shows the date of the most recent price fetch, and remove the ⚠ warning triangle that was embedded inline in the Current Price cell.

## Current State Analysis

`DashboardView.tsx` contains a `formatCurrentPrice()` helper (lines 34–45) that bakes both the price number and a stale-date annotation (`⚠ 10 Jun`) into a single string when `!pos.isFresh && pos.priceDate`. The table has 8 columns; the expanded transaction sub-row spans all 8 via `colSpan={8}`.

`PortfolioPosition` already carries `priceDate: string | null` and `isFresh: boolean`, so no data model or API changes are needed.

## Desired End State

The portfolio table has a "Price Date" column immediately to the right of "Current Price". Every row with a known price shows the date in DD Mon format (e.g. "10 Jun"). When the price is stale (`isFresh = false`), the date cell renders in muted grey (`text-gray-400`); when fresh, it renders in the default table text colour. The Current Price cell shows a plain number only — no triangle, no date.

### Key Discoveries

- `formatCurrentPrice()` at `src/components/transactions/DashboardView.tsx:34` is the only place the ⚠ is produced — removing it there is sufficient.
- `pos.priceDate` is an ISO timestamp string (`fetched_at` from the prices table); the existing `toLocaleDateString("en-GB", { day: "2-digit", month: "short" })` call already produces the target "10 Jun" format.
- The expanded-row `colSpan` at line 186 must increment from 8 → 9 to remain correct.

## What We're NOT Doing

- No changes to `PortfolioPosition`, `PriceData`, `computePositions`, or any API route.
- No tooltip or hover explanation for the date.
- No mobile-specific hiding of the new column (follows the existing horizontal-scroll approach).

## Implementation Approach

Single-phase edit confined to `DashboardView.tsx`:
1. Simplify `formatCurrentPrice` to return a plain price string.
2. Add a `formatPriceDate` helper.
3. Insert the new `<th>` and `<td>` in the correct position.
4. Bump `colSpan`.

---

## Phase 1: Add Price Date column and remove inline warning

### Overview

Edit `DashboardView.tsx` to split the current combined price+date string into two separate concerns: a clean price cell and a dedicated date column.

### Changes Required

#### 1. Simplify `formatCurrentPrice`

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Strip out the stale-date/triangle branch so the function returns only the formatted price number. The date is now the responsibility of the new column.

**Contract**: Function signature unchanged. Return value is always either `"—"` (when `pos.currentPrice === null`) or `pos.currentPrice.toFixed(2)`.

#### 2. Add `formatPriceDate` helper

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Produce the DD Mon string for the Price Date cell, returning `"—"` when no date is available.

**Contract**: `function formatPriceDate(pos: PortfolioPosition): string` — reads `pos.priceDate`, formats it with `toLocaleDateString("en-GB", { day: "2-digit", month: "short" })`, falls back to `"—"` when null.

#### 3. Add "Price Date" table header

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Insert a `<th>` for "Price Date" immediately after the existing "Current Price" `<th>`.

**Contract**: Same styling class as sibling headers (`px-4 py-3 font-medium`).

#### 4. Add "Price Date" table cell per position row

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Insert a `<td>` immediately after the Current Price `<td>` in each position row, rendering the formatted date with conditional muted styling for stale prices.

**Contract**: Cell uses `text-gray-400` class when `!pos.isFresh`, default text otherwise. Content is `formatPriceDate(pos)`.

#### 5. Increment `colSpan` on expanded transaction sub-row

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Keep the expanded-row inner table spanning the full width after adding one column.

**Contract**: Change `colSpan={8}` → `colSpan={9}` at the `<td>` wrapping the nested transactions table (line 186).

### Success Criteria

#### Automated Verification

- Linting passes: `npm run lint`
- Type checking passes: `npm run typecheck`

#### Manual Verification

- Portfolio table shows "Price Date" column to the right of "Current Price"
- Price cells show plain numbers only — no ⚠ triangle
- Fresh-price date cells render in normal text colour
- Stale-price date cells render in muted grey
- Tickers with no price data show "—" in the Price Date column
- Expanding a position row (chevron) still spans full table width with no layout break
- Horizontal scroll on mobile still works

**Implementation Note**: After automated checks pass, verify manually in the running app before marking complete.

---

## Testing Strategy

### Manual Testing Steps

1. Load the dashboard with at least one position that has a fresh price — confirm date shows in normal colour
2. If a stale-price ticker is available (weekend / market closed), confirm its date cell is greyed
3. Expand any position row — confirm inner table still spans correctly
4. Resize viewport to mobile width — confirm horizontal scroll still works

## References

- Change context: `context/changes/price-date-column/change.md`
- Main file: `src/components/transactions/DashboardView.tsx`
- Portfolio types: `src/lib/portfolio.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Add Price Date column and remove inline warning

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — eb84bcd
- [x] 1.2 Type checking passes: `npm run typecheck` — eb84bcd

#### Manual

- [x] 1.3 "Price Date" column appears to the right of "Current Price" — eb84bcd
- [x] 1.4 Price cells show plain numbers only — no ⚠ triangle — eb84bcd
- [x] 1.5 Fresh dates render in normal colour; stale dates in muted grey — eb84bcd
- [x] 1.6 Tickers with no price show "—" in the Price Date column — eb84bcd
- [x] 1.7 Expanded position row still spans full table width — eb84bcd
- [x] 1.8 Horizontal scroll on mobile still works — eb84bcd
