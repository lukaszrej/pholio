<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: External Dependency Resilience Tests

- **Plan**: context/changes/testing-external-dependency-resilience/plan.md
- **Scope**: All Phases (1 + 2 + 3 of 3)
- **Date**: 2026-06-17
- **Verdict**: NEEDS ATTENTION → resolved by triage
- **Findings**: 0 critical 2 warnings 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Automated verification (at commit time)

- `npm test` — 25/25 ✅
- `npm run typecheck` — 0 errors ✅
- `npm run lint` — clean ✅ (current lint errors are from subsequent uncommitted work in testing-business-logic-unit-suite)
- `npm run test:integration` — ✅ (requires local Supabase; verified at 298bd5c)

## Findings

### F1 — Unplanned Case (c) and out-of-order test labels

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/test/integration/prices.integration.test.ts:100
- **Detail**: The plan explicitly de-scoped the happy-path write-through test. Case (c) was added anyway and tests change_pct upsert propagation. Tests were also ordered (a)→(c)→(b) in the file, making labels non-sequential.
- **Fix A ⭐ Applied**: Added a one-line addendum to §6.3 of test-plan.md documenting case (c); reordered tests to (a)→(b)→(c).
- **Decision**: FIXED via Fix A

### F2 — .single() with cast-away error field in stale-cache re-SELECT

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (test reliability)
- **Location**: src/test/integration/prices.integration.test.ts:85
- **Detail**: Test (a)'s re-SELECT used `.single()` and cast away the `.error` field. If the row was missing, the error would be silently dropped, producing a misleading failure message. Test (b) correctly used `.maybeSingle()` for the same pattern.
- **Fix**: Replaced `.single()` with `.maybeSingle()` to match the consistent pattern.
- **Decision**: FIXED

### F3 — select("\*") in prices.ts cache read

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/prices.ts:15
- **Detail**: Cache-read query used `.select("*")`. Schema has only four columns today so safe, but a silent regression path if the table grows.
- **Fix**: Replaced with `.select("ticker, price, fetched_at, change_pct")` to make the column contract explicit.
- **Decision**: FIXED
