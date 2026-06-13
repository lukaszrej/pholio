# Portfolio Summary Card — Plan Brief

> Full plan: `context/changes/portfolio-summary-card/plan.md`

## What & Why

Add an aggregated summary card to the portfolio dashboard showing Total Invested, Current Value, and Unrealized P&L (absolute + %) across all positions. A draft was committed in `f45fc71`; this plan closes the remaining gaps: shared formatting helpers, responsive layout, and a multi-currency footnote.

## Starting Point

The draft commit introduced `computePortfolioSummary` in `portfolio.ts`, a `PortfolioSummaryCard` component, and wiring in `DashboardView`. The card renders correctly at desktop widths but has three known rough edges (duplicated helpers, fixed 3-column grid, silent P&L exclusions).

## Desired End State

The card reads correctly at all viewport widths. When a portfolio contains multi-currency positions that are excluded from the P&L total, a footnote says so explicitly. All number-formatting helpers used across portfolio components come from a single shared file.

## Key Decisions Made

| Decision                    | Choice                                   | Why (1 sentence)                                                                                   | Source |
| --------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ |
| Formatting helpers          | Extract to `src/lib/format.ts`           | Prevents a third copy the next time a display component needs them                                 | Plan   |
| Multi-currency transparency | Footnote on card when excluded count > 0 | Partial P&L without explanation will confuse users who have mixed-currency tickers                 | Plan   |
| Responsive layout           | `grid-cols-1 sm:grid-cols-3`             | Zero-cost Tailwind change; PRD targets desktop but a one-liner prevents breakage on narrow windows | Plan   |
| Unit tests                  | Deferred                                 | No existing test suite; scope kept tight per user decision                                         | Plan   |

## Scope

**In scope:**

- `src/lib/format.ts` — new shared formatting utility
- `DashboardView.tsx` — import shared helpers, remove local copies
- `PortfolioSummaryCard.tsx` — import shared helpers, responsive grid, multi-currency footnote
- `portfolio.ts` — add `excludedCount` to `PortfolioSummary` + `computePortfolioSummary`

**Out of scope:**

- Unit tests for `computePortfolioSummary`
- New metrics beyond the three in the draft
- Currency conversion
- Animation or loading state for the card

## Architecture / Approach

Pure frontend change. Phase 1 is a safe refactor (extract helpers, no visible change). Phase 2 touches the computation interface and the card render — both are isolated to three files. No DB, no API, no new dependencies.

## Phases at a Glance

| Phase                                  | What it delivers                          | Key risk                                                                                       |
| -------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1. Extract shared formatting utilities | `src/lib/format.ts` + consumers updated   | `roiClass` → `pnlClass` rename could miss a call-site                                          |
| 2. Harden card                         | Responsive grid + multi-currency footnote | `excludedCount` interface change must stay in sync across interface, compute fn, and component |

**Prerequisites:** Draft commit `f45fc71` already on `main`  
**Estimated effort:** ~1 session across 2 phases

## Open Risks & Assumptions

- The rename `roiClass` → `pnlClass` in `DashboardView.tsx` must be applied at every JSX call-site; TypeScript will catch any missed reference
- `excludedCount` counts only `hasMultipleCurrencies` positions — positions with missing prices are intentionally excluded from this count

## Success Criteria (Summary)

- `npx astro check` + `npm run lint` + `npm run build` all pass after Phase 2
- Card is readable at 375 px viewport width
- Multi-currency footnote appears if and only if at least one position has multiple currencies
