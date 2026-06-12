<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Portfolio Table — Add Cost Basis & % of Net Liq Columns, Rename Value Labels

- **Plan**: context/changes/portfolio-columns-rename-and-add/plan.md
- **Scope**: Phase 1 + Phase 2 of 2 (full plan)
- **Date**: 2026-06-13
- **Verdict**: APPROVED (after triage fixes)
- **Findings**: 0 critical  1 warning  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS (fixed) |
| Architecture | PASS |
| Pattern Consistency | PASS (fixed) |
| Success Criteria | PASS |

## Findings

### F1 — Division by zero when all positions have $0 price

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/transactions/DashboardView.tsx:164
- **Detail**: Guard checked `portfolioSummary.currentValue !== null` but not `!== 0`. If all positions have positionValue of $0 (zero prices, not absent), currentValue is 0 (not null), causing division by zero and rendering NaN% in every row.
- **Fix**: Added `&& portfolioSummary.currentValue !== 0` to the condition (later superseded by F4 fix which moved computation to `computePositions`).
- **Decision**: FIXED

### F2 — Cost basis formula inlined rather than sourced from computePositions

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/transactions/DashboardView.tsx:176
- **Detail**: `(pos.avgCost * pos.totalShares)` was inline in the render. Same formula lives inside computePortfolioSummary. If cost basis definition ever widens, two places need updating. Plan explicitly ruled out adding a costBasis field — user chose to fix anyway.
- **Fix**: Added `costBasis: number` to `PortfolioPosition`, computed as `avgCost * totalShares` in `computePositions`. Render now uses `pos.costBasis.toFixed(2)`.
- **Decision**: FIXED

### F3 — `+ "%"` string concatenation vs. JSX pattern used elsewhere

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/transactions/DashboardView.tsx:164
- **Detail**: New cell appended % via string concat (`.toFixed(2) + "%"`), while the P&L % cell uses a JSX conditional `{pos.roiPct !== null && "%"}`. Plan specified the concat form; this was a style inconsistency.
- **Fix**: Changed to template literal `` `${...}%` `` (later superseded by F4 fix which simplified to `pos.weightPct.toFixed(2) + "%"`).
- **Decision**: FIXED

### F4 — Inline % of net liq computation per row on every render

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/transactions/DashboardView.tsx:163–165
- **Detail**: Division + multiply + toFixed ran inline per row on every render. portfolioSummary was memoized but the expression still re-ran on dialog open/close or selectedTicker changes.
- **Fix**: Added `weightPct: number | null` to `PortfolioPosition`. `computePositions` now does a two-pass: first builds raw positions, then sums total value and annotates each with `weightPct`. Render cell simplified to `{pos.weightPct !== null ? \`${pos.weightPct.toFixed(2)}%\` : "—"}`. Also resolves the zero-guard concern from F1 (totalValue > 0 guard is inside computePositions).
- **Decision**: FIXED
