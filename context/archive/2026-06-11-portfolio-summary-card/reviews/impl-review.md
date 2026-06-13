<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Portfolio Summary Card

- **Plan**: context/changes/portfolio-summary-card/plan.md
- **Scope**: All phases (1–2 of 2)
- **Date**: 2026-06-11
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — formatSigned decimals parameter is unguarded

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/format.ts:9
- **Detail**: `value.toFixed(decimals)` throws a RangeError if a caller passes `decimals` outside [0, 100]. Default of 2 is always safe; all current call-sites pass no argument. Risk only materialises if a future caller passes a dynamic/user-supplied value.
- **Fix**: Clamp the argument: `Math.max(0, Math.min(100, decimals))` inside `formatSigned` before calling `toFixed`.
- **Decision**: FIXED

### F2 — .claude/settings.local.json bundled into Phase 1 commit

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .claude/settings.local.json (commit eec50ba)
- **Detail**: This file was not in the plan's change list but landed in the Phase 1 commit by user choice at the dirty-path prompt. No application code is affected; it is a local tooling file. Noted for traceability — not an error, just unplanned scope.
- **Fix**: No action required. Already committed; file is benign.
- **Decision**: SKIPPED

### F3 — totalPnLPct and totalInvested computed on different position subsets

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/portfolio.ts:42–53
- **Detail**: `totalInvested` (line 42) sums all positions; `totalPnLPct` (line 53) uses only `pnlPositions` (`roiAbs !== null`), so its denominator excludes multi-currency cost basis. The two headline figures are thus not directly comparable. This is a pre-existing design choice — not introduced by this PR — and the new `excludedCount` footnote correctly discloses the exclusion to users, which is an improvement.
- **Fix**: No action required for this PR. If a future change wants consistent denominators, scope a separate "P&L scope" decision first.
- **Decision**: SKIPPED
