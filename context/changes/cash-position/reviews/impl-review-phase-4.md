<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Cash Position Tracking

- **Plan**: context/changes/cash-position/plan.md
- **Scope**: Phase 4 of 4
- **Date**: 2026-06-21
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — cashBalance is never null; block always clickable

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/transactions/DashboardView.tsx:283-289
- **Detail**: `portfolioCashMap` pre-populated every portfolio using `computeCashBalance(...)` (returns 0 for no cash rows), so `portfolioCashMap.get(p.id) ?? null` never reached the null fallback. `cashBalance` was always a non-null number. Result: Cash Position block was permanently clickable and showed `0.00 USD` instead of `—` for portfolios with no cash. Clicking opened LotsModal with an empty table.
- **Fix A ⭐ Applied**: Changed map to `Map<string, number | null>`; store null when no cash-type transactions exist (`txns.some(t => t.transaction_type !== "equity")`). Restores `—` display and non-clickable guard for truly empty portfolios; balance=0 from offsetting transactions still clickable.
- **Decision**: FIXED via Fix A

### F2 — Plan item 4.1 committed one phase early

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/portfolio/PortfolioSection.tsx:728-788
- **Detail**: Clickable Cash Position block (plan item 4.1) was implemented and committed in Phase 3 commit (354e549), not Phase 4. Phase 4 commit message (a1e4fe6) incorrectly claims PortfolioSection.tsx was touched — git show confirms only LotsModal.tsx and plan.md changed in that commit. No functionality missing; implementation is correct.
- **Fix**: Annotated plan.md item 4.1 with a note documenting the early delivery. No code change needed.
- **Decision**: SKIPPED (annotated in plan.md)

### F3 — LotsModal has no empty-state row for cash

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/transactions/LotsModal.tsx:43-78
- **Detail**: When `lots.length === 0`, `<tbody>` rendered empty — no message, just column headers. Reachable when deposits and withdrawals net to exactly zero (cashBalance = 0, still clickable and non-null after F1 fix).
- **Fix**: Added `isCash && lots.length === 0` guard rendering a "No cash movements" colspan row before the lots.map().
- **Decision**: FIXED
