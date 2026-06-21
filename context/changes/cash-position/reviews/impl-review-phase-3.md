<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Cash Position Tracking

- **Plan**: context/changes/cash-position/plan.md
- **Scope**: Phase 3 of 4
- **Date**: 2026-06-21
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 3 warnings 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Success Criteria

| Check          | Result                                          |
| -------------- | ----------------------------------------------- |
| 3.1 typecheck  | ✅ PASS — 0 errors                              |
| 3.2 lint       | ✅ PASS — clean                                 |
| 3.3 unit tests | ✅ PASS — 50/50                                 |
| 3.4–3.7 Manual | ✅ PASS — confirmed in Progress, commit 354e549 |

## Findings

### F1 — Phase 4 Cash Position display + click wiring landed in Phase 3

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/components/portfolio/PortfolioSection.tsx:724–792
- **Detail**: Phase 3 commit added not only the empty-state guard but the full Cash Position display block + Phase 4's onClick → onShowLots("CASH", portfolio.id), cursor pointer, and hover affordance. The implementation is functionally correct per Phase 4's spec. Phase 4's PortfolioSection.tsx work is already complete.
- **Fix Applied**: Updated plan.md Phase 4 Change 1 with a delivery note — "Delivered early in Phase 3 (commit 354e549). No PortfolioSection.tsx changes needed for Phase 4."
- **Decision**: FIXED via Fix A

### F2 — Net-zero cash balance (deposits == withdrawals) triggers empty state

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/transactions/DashboardView.tsx:283–289
- **Detail**: computeCashBalance returns 0 for both "no cash rows" and "cash rows netting to zero". portfolioCashMap stored 0 in both cases, so ?? null never fired and cashBalance was always 0 for no-cash portfolios. The guard `cashBalance === 0` then showed "No positions yet" even when the user had real cash history. Plan's test step 5 says "No positions yet only if no transactions remain."
- **Fix Applied**: Changed portfolioCashMap useMemo to store null when no cash transactions exist (hasCash check), and the computed balance only when cash rows are present. PortfolioSection's guard now correctly distinguishes null (no cash rows → empty state) from 0 (net-zero cash → show cash layout).
- **Decision**: FIXED

### F3 — onMouseLeave resets background to "" instead of "transparent"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/portfolio/PortfolioSection.tsx:753
- **Detail**: Every other hoverable element in the file resets background to "transparent" or "none" on mouseLeave (rows at lines 357, 559, 669; buttons at 197, 222). The Cash Position block was the only element using "" (empty string), which removes the inline style property and lets the cascade apply rather than explicitly setting transparent.
- **Fix Applied**: Changed `e.currentTarget.style.background = ""` to `e.currentTarget.style.background = "transparent"`.
- **Decision**: FIXED

### F4 — borderRadius: 4 has no visual effect on the Cash Position div

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/portfolio/PortfolioSection.tsx:733
- **Detail**: The Cash Position div had borderRadius: 4 in its base style with no background, box-shadow, or full border. On hover the background would fill with slight rounding while sibling row hovers are not rounded. Purely cosmetic inconsistency.
- **Fix Applied**: Removed `borderRadius: 4` from the div's style.
- **Decision**: FIXED
