# Cash in Portfolio Summary Implementation Plan

## Overview

After the `cash-position` change shipped, cash deposits/withdrawals are tracked and shown in the `PortfolioSection` sidebar, but the headline **"Portfolio value"** in `PortfolioSummaryCard` still reflects equity only. Depositing cash does not change the number the user reads as their portfolio's worth. This plan folds each portfolio's cash balance into that headline total (a single number = equity value + cash), while keeping all ROI metrics (cost basis, unrealized P&L, total return, return multiple) equity-only so cash cannot distort performance math.

## Current State Analysis

- **`computePortfolioSummary(positions)`** (`src/lib/portfolio.ts:48`) derives `currentValue` purely from equity positions. `currentValue` is `number | null` — `null` when no equity position has a price (e.g. a cash-only portfolio). It never sees cash.
- **`computeCashBalance(transactions)`** (`src/lib/portfolio.ts:104`) already exists and is correct (deposit `+amount`, withdrawal `-amount`). It is wired only into the sidebar, never into the summary.
- **`DashboardView`** already builds `portfolioCashMap` per portfolio (`src/components/transactions/DashboardView.tsx:283`) and `activeSummary` (line 303) via `computePortfolioSummary(pos)` with no cash. The `PortfolioSummaryCard` is rendered only on individual portfolio tabs (`activeTab !== "all"`, line 608); the "All portfolios" tab renders `CardSection`s, not the summary card.
- **`PortfolioSection`** computes its **own** equity-only summary (`computePortfolioSummary(positions)`, `src/components/portfolio/PortfolioSection.tsx:152`) and receives `cashBalance` as a separate prop. Its "% of Portfolio" stat uses `cashBalance / (summary.currentValue + cashBalance)` (line 781) — correct only while that `currentValue` is equity-only.
- **`summary.currency`** is `null` when there are no equity positions, so a cash-only portfolio has no currency from positions; the cash currency must come from the cash transactions.

### Key Discoveries:

- The double-count landmine is avoided structurally: because `PortfolioSection` calls `computePortfolioSummary` **without** a cash argument (line 152), keeping the new cash parameter optional and defaulted leaves the sidebar's denominator (`currentValue_equity + cashBalance`) correct. Do **not** thread cash into line 152.
- ROI inputs (`totalInvested`, `totalPnL`, `totalPnLPct`, `pnlCostBasis`) are computed from equity positions and must stay so — only `currentValue` and `currency` change.
- The card always renders on an individual tab regardless of position count, so a cash-only portfolio's card must show the cash as value (handled by the cash-only branch of `currentValue`).

## Desired End State

On an individual portfolio tab, "Portfolio value" in `PortfolioSummaryCard` equals equity current value **plus** cash balance, as one number with the portfolio currency suffix. A cash-only portfolio shows its cash balance (with the cash currency) instead of "—". Cost basis, Unrealized P&L, Total return, and Return multiple are unchanged by cash. The sidebar's Balance and "% of Portfolio" stats are unchanged (no double-count). The "All portfolios" tab is unchanged. Unit tests in `src/lib/portfolio.test.ts` prove the new math with hand-computed oracles.

**Verification:** `npm test` passes including new cash-summary cases; manually, depositing cash raises "Portfolio value" by exactly the deposit, a withdrawal lowers it, a cash-only portfolio shows its cash, ROI stats don't move, and the sidebar % is unchanged.

## What We're NOT Doing

- Not including cash in cost basis, unrealized P&L, total return %, or return multiple (decision: keep ROI equity-only).
- Not showing a separate "Cash" line/stat inside `PortfolioSummaryCard` (decision: fold into the single total; the sidebar already shows the split).
- Not changing the "All portfolios" tab or `combinedSummary` (out of scope; the card isn't shown there).
- Not changing `PortfolioSection`'s sidebar summary, Balance, or "% of Portfolio" logic.
- No API, schema, migration, or `computeCashBalance` changes.
- No multi-currency cash aggregation or FX conversion.

## Implementation Approach

Bottom-up: change the pure function first and pin it with unit tests (highest-risk math, cheapest layer), then wire the already-available per-portfolio cash into `activeSummary` in `DashboardView`. The cash parameter on `computePortfolioSummary` is optional so every other call site (the sidebar's `PortfolioSection`, the `combinedSummary` "All" path) keeps its current equity-only behavior with no edit.

## Critical Implementation Details

- **Do not pass cash to `PortfolioSection.tsx:152`.** Its "% of Portfolio" denominator already adds `cashBalance` to an equity-only `currentValue`; folding cash in there too would double-count. The new parameter stays optional precisely so this call is untouched.
- **Cash-only `currentValue`:** when there are no valued equity positions but cash is non-zero, `currentValue` must be the cash balance (treat equity value as 0), not `null`. When there are no valued positions and cash is zero, keep `null` so the "—" path is preserved.
- **Cash-only currency:** equity currency derivation is unchanged; only when there are no equity positions does the summary currency fall back to the cash currency so the cash-only card shows a currency suffix.

## Phase 1: Summary math + unit tests

### Overview

Extend `computePortfolioSummary` to optionally fold cash into `currentValue` and `currency`, leaving all ROI fields equity-only, and prove it with hand-computed Vitest oracles.

### Changes Required:

#### 1. `computePortfolioSummary` cash parameter

**File**: `src/lib/portfolio.ts`

**Intent**: Add an optional cash input so the summary's `currentValue` reflects equity + cash and a cash-only portfolio shows its cash, without touching cost-basis or P&L math.

**Contract**: Extend the signature to accept optional cash, e.g. `computePortfolioSummary(positions: PortfolioPosition[], cashBalance = 0, cashCurrency: string | null = null): PortfolioSummary`. Behavior:

- `totalInvested`, `totalPnL`, `totalPnLPct`, `pnlCostBasis`, `excludedCount`, `positionCount` — unchanged (equity positions only).
- `currentValue`: let `equityValue = valuedPositions.length > 0 ? sum(positionValue) : null`. Then `currentValue = (equityValue !== null || cashBalance !== 0) ? (equityValue ?? 0) + cashBalance : null`.
- `currency`: keep the existing single-equity-currency derivation; when it would be `null` **and** `positionCount === 0`, fall back to `cashCurrency`.
- Default arguments mean existing callers (`PortfolioSection.tsx:152`, the `combinedSummary`/"all" path) are unaffected.

#### 2. Unit tests for cash in the summary

**File**: `src/lib/portfolio.test.ts`

**Intent**: Lock the new behavior at the cheapest layer per the project's #1 risk, using hand-computed oracles (cookbook §6.1 oracle rule).

**Contract**: Add cases under (or beside) `describe("computePortfolioSummary")`:

- Deposit raises `currentValue` by exactly the cash balance over the equity-only value (hand-computed numbers).
- Net withdrawal (negative cash) lowers `currentValue` accordingly.
- Cash-only (no priced positions, cash > 0): `currentValue === cashBalance`, `currency === cashCurrency`, and ROI fields (`totalInvested`, `totalPnL`, `totalPnLPct`) stay at their no-equity values.
- No equity prices and zero cash: `currentValue === null` (preserved).
- ROI isolation: with both equity and cash, `totalInvested` / `totalPnL` / `totalPnLPct` are identical to the same call without cash.
- Backward-compat: calling with no cash arg returns the same result as before.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npm run typecheck` (or the project's typecheck script)
- Linting passes: `npm run lint`

#### Manual Verification:

- New test names clearly describe the deposit/withdrawal/cash-only/ROI-isolation oracles.

**Implementation Note**: After Phase 1 automated verification passes, pause for human confirmation before Phase 2.

---

## Phase 2: Wire cash through DashboardView + manual verification

### Overview

Feed each portfolio's existing cash balance (and its currency) into `activeSummary` for individual tabs, so the rendered `PortfolioSummaryCard` total includes cash. Leave the "All" path and the sidebar untouched.

### Changes Required:

#### 1. Thread cash into `activeSummary`

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: For an individual portfolio tab, compute the summary with that portfolio's cash balance and cash currency; the "all" tab keeps `combinedSummary` (equity-only).

**Contract**: In the `activeSummary` memo (line ~303), for `activeTab !== "all"` call `computePortfolioSummary(pos, cashBalance, cashCurrency)` where `cashBalance = portfolioCashMap.get(activeTab) ?? 0` and `cashCurrency` is the single currency of that portfolio's cash transactions (`null` if none or mixed). Derive `cashCurrency` from `txByPortfolio.get(activeTab)` cash rows (`transaction_type !== "equity"`); add `txByPortfolio` to the memo deps. The `activeTab === "all"` branch still returns `combinedSummary` unchanged. Do not alter the `PortfolioSummaryCard` props interface or the `PortfolioSection` render.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests still pass: `npm test`

#### Manual Verification:

- On an individual portfolio tab, adding a cash **deposit** increases "Portfolio value" by exactly the deposit amount; a **withdrawal** decreases it.
- Cost basis, Unrealized P&L, Total return, and Return multiple are unchanged after a cash movement.
- A cash-only portfolio's tab shows the cash balance (with currency) as "Portfolio value" instead of "—".
- The sidebar's Balance and "% of Portfolio" stats are unchanged (no double-count regression).
- The "All portfolios" tab is visually unchanged.

**Implementation Note**: After Phase 2 automated verification passes, confirm the manual checks above with the human before closing the change.

---

## Testing Strategy

### Unit Tests:

- `computePortfolioSummary` with cash: deposit/withdrawal effect on `currentValue`, cash-only value + currency fallback, zero-cash null preservation, ROI-field isolation, and no-arg backward compatibility — all with hand-computed oracles (cookbook §6.1).

### Manual Testing Steps:

1. On a portfolio with equity, note "Portfolio value"; add a $1,000 deposit → value rises by exactly 1,000; ROI stats unchanged.
2. Add a withdrawal → value drops by that amount.
3. Open a cash-only portfolio's tab → value shows the cash balance with currency, not "—".
4. Confirm the sidebar Balance and "% of Portfolio" match pre-change behavior.
5. Switch to "All portfolios" → unchanged.

## Performance Considerations

Negligible — one extra reduce over already-loaded transactions inside an existing memo; no new fetches or renders.

## Migration Notes

None — no schema, data, or API changes.

## References

- Source research: `context/changes/cash-position/research.md` (Follow-up Research 2026-06-21 — gap assessment and related files)
- Predecessor: `context/changes/cash-position/plan-brief.md`
- `src/lib/portfolio.ts:48` — `computePortfolioSummary`
- `src/lib/portfolio.ts:104` — `computeCashBalance`
- `src/components/transactions/DashboardView.tsx:303` — `activeSummary`
- `src/components/portfolio/PortfolioSection.tsx:152,781` — sidebar summary + "% of Portfolio" (must stay equity-only)
- Cookbook: `context/foundation/test-plan.md` §6.1 (unit test location, naming, oracle rule)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Summary math + unit tests

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — dc2da0e
- [x] 1.2 Type checking passes — dc2da0e
- [x] 1.3 Linting passes — dc2da0e

#### Manual

- [x] 1.4 New test names clearly describe the deposit/withdrawal/cash-only/ROI-isolation oracles — dc2da0e

### Phase 2: Wire cash through DashboardView + manual verification

#### Automated

- [x] 2.1 Type checking passes — 96c531d
- [x] 2.2 Linting passes — 96c531d
- [x] 2.3 Unit tests still pass: `npm test` — 96c531d

#### Manual

- [x] 2.4 Deposit increases "Portfolio value" by exactly the deposit; withdrawal decreases it — b415773
- [x] 2.5 Cost basis, Unrealized P&L, Total return, Return multiple unchanged after a cash movement — b415773
- [x] 2.6 Cash-only portfolio tab shows cash balance (with currency) as "Portfolio value", not "—" — b415773
- [x] 2.7 Sidebar Balance and "% of Portfolio" unchanged (no double-count) — b415773
- [x] 2.8 "All portfolios" tab visually unchanged — b415773
