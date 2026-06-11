# Portfolio Summary Card — Implementation Plan

## Overview

Harden the portfolio summary card that was drafted and committed in `f45fc71`. The draft delivers the core three-metric layout (Total Invested / Current Value / Unrealized P&L) but has three known gaps: formatting helpers are duplicated between two components, the card does not adapt to narrow viewports, and multi-currency portfolios show a partial P&L with no explanation. This plan closes those gaps in two sequential phases.

## Current State Analysis

The draft landed these artifacts:

- `src/lib/portfolio.ts` — `PortfolioSummary` interface + `computePortfolioSummary` function added
- `src/components/portfolio/PortfolioSummaryCard.tsx` — new card component
- `src/components/transactions/DashboardView.tsx` — wired with `useMemo` for `portfolioSummary`, `<PortfolioSummaryCard>` rendered above the table

**Gaps identified during planning:**

- `formatSigned` and `pnlClass` helpers are copy-pasted into both `DashboardView.tsx` and `PortfolioSummaryCard.tsx`; no shared util exists yet in `src/lib/`
- `grid-cols-3` is unconditional — collapses unreadably on narrow screens
- `PortfolioSummary` has no `excludedCount` field; the card has no way to tell the user that multi-currency positions were excluded from the P&L total

## Desired End State

The portfolio summary card renders correctly at all viewport widths, exposes the count of multi-currency positions excluded from P&L calculations when relevant, and all formatting helpers are sourced from a single shared utility file.

### Key Discoveries:

- `DashboardView.tsx:40–48` defines `roiClass` and `formatSigned` locally; identical logic is at `PortfolioSummaryCard.tsx:7–16`
- `computePortfolioSummary` (`portfolio.ts:38`) filters `pnlPositions` via `roiAbs !== null`; multi-currency is one of two reasons `roiAbs` is null (the other is missing price). Only multi-currency exclusions deserve a user-facing note; missing-price positions already render "—" on the table row
- `hasMultipleCurrencies` is already a field on `PortfolioPosition` — counting it is a one-liner

## What We're NOT Doing

- No unit tests (deferred by user decision)
- No currency conversion — mixed-currency value summing is unchanged and consistent with the sector chart
- No new metrics beyond the three already in the draft
- No animation or loading skeleton for the card

## Implementation Approach

Two short phases. Phase 1 creates the shared format utility and updates both consumers — pure refactor, zero visible change. Phase 2 touches the `PortfolioSummary` interface, the compute function, and the card component to add responsive layout and the multi-currency footnote.

## Phase 1: Extract shared formatting utilities

### Overview

Move the `formatSigned` and `pnlClass` helpers from their two local homes into a new `src/lib/format.ts` module. Update `DashboardView.tsx` and `PortfolioSummaryCard.tsx` to import from there.

### Changes Required:

#### 1. Create `src/lib/format.ts`

**File**: `src/lib/format.ts` _(new file)_

**Intent**: Provide the two number-formatting helpers used by portfolio display components as shared exports.

**Contract**: Export `formatSigned(value: number | null, decimals?: number): string` (default `decimals = 2`) and `pnlClass(value: number | null): string`. Logic is identical to the current local copies — no behaviour change, only extraction.

#### 2. Update `DashboardView.tsx`

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Remove the local `formatSigned` and `roiClass` definitions and import both from `@/lib/format`. The existing call-sites (`roiClass` → `pnlClass`) are renamed to match the canonical export name.

**Contract**: Delete the two local function declarations. Add `import { formatSigned, pnlClass } from "@/lib/format"`. Replace every `roiClass(...)` call in JSX with `pnlClass(...)`.

#### 3. Update `PortfolioSummaryCard.tsx`

**File**: `src/components/portfolio/PortfolioSummaryCard.tsx`

**Intent**: Remove the local `formatSigned` and `pnlClass` definitions and import both from `@/lib/format`.

**Contract**: Delete the two local function declarations. Add `import { formatSigned, pnlClass } from "@/lib/format"`.

### Success Criteria:

#### Automated Verification:

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:

- Dashboard loads without visual change — card and table P&L colours and formatting are identical to before

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Harden card — responsive layout + multi-currency footnote

### Overview

Add `excludedCount` to `PortfolioSummary`, update `computePortfolioSummary` to populate it, change the card grid to `grid-cols-1 sm:grid-cols-3`, and render the multi-currency footnote when `excludedCount > 0`.

### Changes Required:

#### 1. Update `PortfolioSummary` interface and `computePortfolioSummary`

**File**: `src/lib/portfolio.ts`

**Intent**: Track how many positions were excluded from the P&L total due to multi-currency — so the card can communicate this to the user. Missing-price exclusions are not counted (they already surface as "—" in the table row).

**Contract**: Add `excludedCount: number` to `PortfolioSummary`. Inside `computePortfolioSummary`, compute `const excludedCount = positions.filter((p) => p.hasMultipleCurrencies).length` and include it in the returned object.

#### 2. Update `PortfolioSummaryCard.tsx`

**File**: `src/components/portfolio/PortfolioSummaryCard.tsx`

**Intent**: Make the card readable at narrow viewports and tell the user when multi-currency positions were left out of the P&L total.

**Contract**:

- Destructure `excludedCount` from `summary`
- Change the grid wrapper class from `grid-cols-3` to `grid-cols-1 sm:grid-cols-3`
- In the Unrealized P&L cell, below the value paragraph, conditionally render: when `excludedCount > 0` → `<p className="mt-1 text-xs text-gray-400">Excludes {excludedCount} multi-currency {excludedCount === 1 ? "position" : "positions"}.</p>`

### Success Criteria:

#### Automated Verification:

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- At desktop width: card still shows 3 columns side by side
- At narrow width (< 640 px, e.g. DevTools mobile emulation): cells stack vertically, all three are readable
- Portfolio with only single-currency positions: no footnote appears
- Portfolio with at least one multi-currency ticker: footnote `"Excludes N multi-currency position(s)."` appears below the P&L value

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before marking the phase complete.

---

## Testing Strategy

### Manual Testing Steps:

1. Verify P&L formatting unchanged after Phase 1 (sign, colour, percentage)
2. Resize browser to 375 px wide — all three card cells visible without overflow
3. Add a transaction where the same ticker has two different currencies — verify footnote appears
4. Confirm footnote is absent on a single-currency portfolio

## References

- Draft commit: `f45fc71` (`feat(portfolio): add aggregated portfolio summary card to dashboard`)
- Computation logic: `src/lib/portfolio.ts` `computePortfolioSummary`
- Lessons: `context/foundation/lessons.md` (double quotes in TS — L3)
- Related plan: `context/archive/2026-06-10-sector-allocation-chart/plan.md` (component structure patterns)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extract shared formatting utilities

#### Automated

- [x] 1.1 Type check passes (`npx astro check`) — eec50ba
- [x] 1.2 Lint passes (`npm run lint`) — eec50ba

#### Manual

- [x] 1.3 Dashboard loads without visual change — card and table formatting identical to before — eec50ba

### Phase 2: Harden card — responsive layout + multi-currency footnote

#### Automated

- [x] 2.1 Type check passes (`npx astro check`)
- [x] 2.2 Lint passes (`npm run lint`)
- [x] 2.3 Build succeeds (`npm run build`)

#### Manual

- [ ] 2.4 Desktop width: 3 columns side by side
- [ ] 2.5 Narrow width (< 640 px): cells stack vertically
- [ ] 2.6 Single-currency portfolio: no footnote
- [ ] 2.7 Multi-currency ticker present: footnote shows correct count
