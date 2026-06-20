<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Watchlist API — Auth-Guard Test

- **Plan**: context/changes/testing-watchlist-api/plan.md
- **Scope**: Phase 1 of 1
- **Date**: 2026-06-20
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Out-of-order test-case labels across describe blocks

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/test/integration/unauthenticated-api.integration.test.ts:44-63
- **Detail**: Watchlist cases were labelled (e) and (f) while the public-routes case that followed in the file was labelled (d). Read-order across the file was a, b, c … e, f … d.
- **Fix**: Re-letter watchlist cases as (d) and (e), bump the existing public-routes case to (f).
- **Decision**: FIXED — re-lettered to d, e, f in file order.

### F2 — Garbage-cookie case omitted body assertion

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/test/integration/unauthenticated-api.integration.test.ts:55-62
- **Detail**: Case (e) (garbage Cookie) asserted status 401 but omitted the body { error: "Unauthorized" } assertion that case (d) (no Cookie) made. Same asymmetry existed in the pre-existing (b) vs (a) pair.
- **Fix**: Add `expect(await response.json()).toEqual({ error: "Unauthorized" })` to case (e), matching case (d).
- **Decision**: FIXED — body assertion added to garbage-cookie case.

## Automated Verification

| Check                    | Result                         |
| ------------------------ | ------------------------------ |
| npm run test:integration | ✅ PASS — 5 files, 21 tests    |
| npm run lint             | ✅ PASS — 0 errors, 0 warnings |
| npm run typecheck        | ✅ PASS — 0 errors, 0 warnings |
