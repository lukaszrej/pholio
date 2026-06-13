<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Lots Modal Implementation Plan

- **Plan**: context/changes/modal-add-edit-transaction/plan.md
- **Scope**: All Phases (Phase 1 + 2 of 2)
- **Date**: 2026-06-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Single-sided ticker normalization in LotsModal

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/transactions/LotsModal.tsx:17
- **Detail**: Filter read `t.ticker.toUpperCase() === ticker` but `ticker` prop came from `pos.ticker` (raw Transaction.ticker, never normalised at ingestion). If stored as "aapl", modal showed empty.
- **Fix**: Normalise both sides: `t.ticker.toUpperCase() === ticker.toUpperCase()`
- **Decision**: FIXED

### F2 — Stale deleteError persists across Cancel

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/transactions/DashboardView.tsx:260
- **Detail**: AlertDialog `onOpenChange` close handler called `setDeletingTransaction(null)` but not `setDeleteError(null)`. After a failed delete + Cancel, deleteError stayed in state. The current onDeleteRequest path cleared it before re-opening, so not observable today — but a 1-line defensive fix.
- **Fix**: Added `setDeleteError(null)` to the `onOpenChange` close handler.
- **Decision**: FIXED

### F3 — formatShares signature widened beyond plan spec

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/format.ts:1
- **Detail**: Plan spec'd `formatShares(n: number)` but implementation is `formatShares(n: number | null)` with a null/NaN guard. Intentional and correct — Transaction.shares is typed as `number | null`. Plan was slightly underspecified.
- **Decision**: ACCEPTED-AS-RULE: When specifying utility helper signatures in plans, check actual TypeScript field types

### F4 — Subtle pre-delete state read lacked explanatory comment

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/transactions/DashboardView.tsx:91
- **Detail**: `hasRemainingLots` computed from `transactions` before `setTransactions` fires — correct but looks like a stale-closure bug to a future reader.
- **Fix**: Added `// read pre-delete state before setTransactions updates the array`
- **Decision**: FIXED

### F5 — Vestigial Fragment wrapper in positions.map

- **Severity**: 👀 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/transactions/DashboardView.tsx:149
- **Detail**: `positions.map` wrapped each row in `<Fragment key={pos.ticker}>` with a single `<tr>` child — left over from when the expansion row was a sibling.
- **Fix**: Removed Fragment wrapper; moved `key` to `<tr>`; removed Fragment from React import.
- **Decision**: FIXED
