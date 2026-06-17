<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Watchlist Quotes API Endpoint

- **Plan**: context/changes/watchlist-live-quotes/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-06-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 1 warning 1 observation

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

### F1 — Unit-style test miscategorized in integration test directory

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/test/integration/watchlist-quotes.integration.test.ts
- **Detail**: Test mocked all dependencies (no real Supabase) but lived in the integration directory, requiring a live local Supabase just to run it. The rest of the integration suite hits a real DB (prices.integration.test.ts, etc.). The plan explicitly offered the unit-test/mock approach — the content was right, the placement was not.
- **Fix A ⭐**: Rename + move to src/pages/api/watchlist/quotes.test.ts so it runs under `npm run test` without Supabase.
  - Strength: Matches mock=unit / real-DB=integration project split. Reduces CI friction.
  - Tradeoff: Minor file rename + move; content unchanged.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — moved to src/pages/api/watchlist/quotes.test.ts; 42 unit tests now pass (was 33).

### F2 — Extra test cases beyond plan-specified coverage

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/api/watchlist/quotes.test.ts
- **Detail**: Four extra test cases beyond plan: (c) absent param → 400, (d) whitespace → 400, (f) lowercase normalisation, (i) null supabase → 500. All correct and add signal; no API surface expanded.
- **Fix**: Accept as-is — all extra cases are correct and cost nothing to keep.
- **Decision**: SKIPPED
