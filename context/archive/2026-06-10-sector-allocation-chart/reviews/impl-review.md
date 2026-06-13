<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Sector Allocation Chart

- **Plan**: context/changes/sector-allocation-chart/plan.md
- **Scope**: Phase 1 + Phase 2 + Phase 3 (full plan)
- **Date**: 2026-06-11
- **Verdict**: APPROVED
- **Findings**: 0 critical 1 warning 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Missing stale-sector fallback in dashboard.astro

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:73–86
- **Detail**: When cache is stale (> 7 days) and Finnhub returns null, `sectors[ticker]` was never set. Ticker silently classified as "Other" despite a known (slightly stale) sector name being available. The prices block has an `else if (cached)` stale fallback; the sectors block did not.
- **Fix A ⭐ Recommended**: Add `} else if (cached) { sectors[ticker] = cached.sector; }` after the fetchSector block.
  - Strength: Mirrors proven prices block pattern exactly.
  - Tradeoff: Shows slightly stale sector until next successful Finnhub hit.
  - Confidence: HIGH — identical pattern proven in prices block.
  - Blind spot: None significant.
- **Fix B**: Accept the degradation; document with a comment.
  - Strength: Zero code change.
  - Tradeoff: Silent regression to "Other" after Finnhub outages post-7-days.
  - Confidence: MEDIUM.
- **Decision**: FIXED via Fix A

### F2 — computeSectorAllocation declared before its dependency type

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/portfolio.ts:3–38 (original)
- **Detail**: `SectorSlice` and `computeSectorAllocation` were defined before `PortfolioPosition` (line 47), which appears in the function's parameter type. TypeScript compiles fine but inverts the file's established convention: PriceData (41) → PortfolioPosition (47) → computePositions (61).
- **Fix**: Move `SectorSlice` and `computeSectorAllocation` to after `PortfolioPosition`.
- **Decision**: FIXED

### F3 — Tooltip double space + unitless value in SectorAllocationChart

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/portfolio/SectorAllocationChart.tsx:66
- **Detail**: Tooltip label had a double space before the parenthesized value. Value is also unitless — accepted plan limitation (no currency conversion in scope), but worth a comment.
- **Fix**: Remove extra space; add comment noting unitless value is intentional by design.
- **Decision**: FIXED
