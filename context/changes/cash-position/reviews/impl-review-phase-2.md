<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Cash Position Tracking

- **Plan**: context/changes/cash-position/plan.md
- **Scope**: Phase 2 of 4
- **Date**: 2026-06-21
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 3 warnings · 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Stale purchase_price not cleared on Cash→Stock mode switch

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: AddTransactionForm.tsx:74-84
- **Detail**: switchMode clears ticker and shares on Cash→Stock but leaves purchase_price. A cash amount silently becomes a per-share price if the user doesn't notice.
- **Fix Applied**: Added `setValue("purchase_price", undefined as unknown as number, { shouldValidate: false })` to the stock branch of switchMode, symmetric with the shares reset.
- **Decision**: FIXED via Fix A

### F2 — Success-path response.json() has no .catch() guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: AddTransactionForm.tsx:119
- **Detail**: Error-path used .catch(); success-path did not. Malformed 2xx body would throw an unhandled rejection and crash the component.
- **Fix Applied**: Added `.catch(() => ({ data: null }))` on the success-path response.json() call; existing null check on json.data handles the fallback.
- **Decision**: FIXED

### F3 — Mode and direction toggles remain interactive during submission

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AddTransactionForm.tsx:133,144,224,237
- **Detail**: Cancel/Submit checked disabled={isSubmitting}; the four toggle buttons did not. No data race (payload captured synchronously), but visually inconsistent.
- **Fix Applied**: Added `disabled={isSubmitting}` to all four toggle buttons (Stock, Cash, Deposit, Withdrawal).
- **Decision**: FIXED

### F4 — Cash mode field order deviates from plan spec

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: AddTransactionForm.tsx:208,220,255
- **Detail**: Plan listed Amount → Deposit/Withdrawal → Date → Currency. Implementation renders Date → Deposit/Withdrawal → Amount → Currency. All fields present; actual order is more natural.
- **Fix Applied**: Updated plan.md Phase 2 spec to reflect the shipped field order.
- **Decision**: FIXED (plan updated)

### F5 — `undefined as unknown as number` cast without WHY comment

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AddTransactionForm.tsx:81
- **Detail**: Accepted RHF pattern to clear a numeric field; safe because Zod's z.coerce.number() rejects it at submit. Comment didn't explain the z.coerce safety net.
- **Decision**: SKIPPED

### F6 — transaction_type form field diverges from UI state in Cash mode

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AddTransactionForm.tsx:87-95
- **Detail**: switchMode never updates the transaction_type RHF field; it stays "equity" while mode/cashDirection hold the real intent. onSubmit unconditionally overrides it before the fetch, so no wrong data reaches the API. Non-obvious to future readers.
- **Fix Applied**: Added a comment above the payload construction noting the intentional override.
- **Decision**: FIXED
