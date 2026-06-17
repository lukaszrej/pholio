<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Business Logic Unit Suite

- **Plan**: context/changes/testing-business-logic-unit-suite/plan.md
- **Scope**: All phases (1–4 of 4)
- **Date**: 2026-06-17
- **Verdict**: NEEDS ATTENTION (resolved via triage)
- **Findings**: 0 critical 3 warnings 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Automated Verification Results

- `npm test` — 2 files, 25 tests, all green ✅
- `npm run lint` — 0 errors (1 pre-existing warning in dashboard.astro) ✅
- `npm run typecheck` — 0 errors ✅

## Findings

### F1 — const vs let in astro-env stub

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/test/stubs/astro-env-server.ts:5
- **Detail**: Plan required `export let FINNHUB_API_KEY` (mutable). Actual used `export const`. Works via vi.mock getter pattern but plan, §6.1, and stub comment all said "mutable let" — misleading for future authors.
- **Fix Applied**: Changed `export const` → `export let` on line 5; updated stub comment to reflect that direct reassignment is now also possible.
- **Decision**: FIXED via Fix A

### F2 — global.fetch not restored in afterEach

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/finnhub.test.ts:19
- **Detail**: afterEach called `mockFetch.mockReset()` but never restored `global.fetch` to its original value. Plan explicitly required "restored in afterEach". Harmless today (per-worker isolation) but diverged from contract.
- **Fix Applied**: Added `let originalFetch: typeof global.fetch`; save in `beforeEach`, restore in `afterEach` before `mockReset()`.
- **Decision**: FIXED

### F3 — Stale line-number anchor in test description

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/finnhub.test.ts:72
- **Detail**: Description read "c === 0 — returns null (named guard at finnhub.ts:53)". Line number rots silently on any future insertion above line 53.
- **Fix Applied**: Changed to "c === 0 — returns null (Finnhub no-data guard)".
- **Decision**: FIXED

### F4 — Module-level \_seq counter never reset between tests

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/portfolio.test.ts:10
- **Detail**: `let _seq` incremented globally across all tests; IDs are t1–tN cumulatively. computePositions ignores `.id` so no correctness risk today. Risk surfaces if future tests assert on ID values.
- **Fix Applied**: Added `beforeEach(() => { _seq = 0; })` at module scope; imported `beforeEach` from vitest.
- **Decision**: FIXED

### F5 — Bare "node_modules" string in vitest exclude array

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: vitest.config.ts:8
- **Detail**: `exclude: ["node_modules", ...]` used bare prefix string; Vitest conventional default is `"**/node_modules/**"`.
- **Fix Applied**: Changed to `"**/node_modules/**"`.
- **Decision**: FIXED
