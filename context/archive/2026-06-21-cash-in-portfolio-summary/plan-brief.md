# Cash in Portfolio Summary — Plan Brief

> Full plan: `context/changes/cash-in-portfolio-summary/plan.md`
> Source research: `context/changes/cash-position/research.md` (Follow-up Research 2026-06-21)

## What & Why

The `cash-position` change made cash deposits/withdrawals visible in the sidebar, but the headline **"Portfolio value"** in `PortfolioSummaryCard` still shows equity only — so depositing cash doesn't change the number the user reads as their portfolio's worth. This change folds cash into that headline total while keeping ROI metrics equity-only.

## Starting Point

`computePortfolioSummary` derives `currentValue` from equity positions only and never sees cash. `computeCashBalance` already exists and is wired into the sidebar, but `DashboardView` builds `activeSummary` without it. The summary card renders only on individual portfolio tabs, not on "All portfolios".

## Desired End State

On an individual portfolio tab, "Portfolio value" = equity current value + cash, shown as one number with the currency suffix. A cash-only portfolio shows its cash balance instead of "—". Cost basis, Unrealized P&L, Total return, and Return multiple are unaffected by cash. The sidebar (Balance, "% of Portfolio") and the "All portfolios" tab are unchanged.

## Key Decisions Made

| Decision             | Choice                                                       | Why (1 sentence)                                                                    | Source |
| -------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------ |
| Card presentation    | Fold cash into the single "Portfolio value" total            | Matches the "my portfolio is worth X" mental model; the sidebar already shows split | Plan   |
| ROI treatment        | Keep cost basis / P&L / return equity-only                   | Cash has no cost basis or gain; mixing it in distorts ROI (PRD #1 risk)             | Plan   |
| Cash-only portfolio  | Show the cash balance as Portfolio value (not "—")           | Cash is first-class; a cash-only portfolio should show its real worth               | Plan   |
| "All portfolios" tab | Out of scope — `combinedSummary` stays equity-only           | The summary card isn't rendered on the "All" tab                                    | Plan   |
| Wiring               | Optional `cashBalance`/`cashCurrency` params on the function | Single source of truth, stays unit-testable, leaves other call sites untouched      | Plan   |
| Testing              | Unit tests on the summary math with hand-computed oracles    | Cheapest layer for the project's #1 risk; cookbook §6.1                             | Plan   |

## Scope

**In scope:** optional cash param on `computePortfolioSummary`; folding cash into `currentValue` + cash-only currency fallback; wiring per-portfolio cash into `activeSummary` in `DashboardView`; unit tests.

**Out of scope:** separate cash line in the card; cash in ROI metrics; "All portfolios" / `combinedSummary`; sidebar changes; multi-currency cash; FX; any API/schema/migration change.

## Architecture / Approach

Bottom-up: change the pure function first (highest-risk math, cheapest test layer), then wire the already-computed `portfolioCashMap` into `activeSummary`. The cash parameter is optional and defaulted, so the sidebar's own `computePortfolioSummary(positions)` call and the "All" path keep equity-only behavior with no edits — which is also what prevents the sidebar "% of Portfolio" double-count.

## Phases at a Glance

| Phase                                  | What it delivers                                                | Key risk                                                     |
| -------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Summary math + unit tests           | Optional cash folded into `currentValue`; oracle unit tests     | ROI fields must stay equity-only; cash-only null handling    |
| 2. Wire through DashboardView + verify | `activeSummary` includes cash on individual tabs; manual checks | Not threading cash into the sidebar's summary (double-count) |

**Prerequisites:** none — builds on shipped `cash-position` work; no new dependencies.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- The sidebar "% of Portfolio" math stays correct only if cash is **not** passed to `PortfolioSection.tsx:152` — enforced by keeping the param optional.
- Cash-only currency is derived from the portfolio's cash transactions; mixed cash currencies fall back to no suffix (single-currency assumption, consistent with `cash-position`).

## Success Criteria (Summary)

- Adding a cash deposit increases "Portfolio value" by exactly the deposit; a withdrawal decreases it.
- ROI metrics are unchanged by cash; a cash-only portfolio shows its cash as the value.
- Sidebar and "All portfolios" tab show no regression.
