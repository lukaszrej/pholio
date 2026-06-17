<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: WatchlistPanel — Replace Mocked Quotes with Live Finnhub Data

- **Plan**: context/changes/watchlist-live-quotes/plan.md
- **Scope**: Phase 3 of 3
- **Date**: 2026-06-17
- **Verdict**: NEEDS ATTENTION (addressed in triage)
- **Findings**: 0 critical 2 warnings 2 observations

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

### F1 — fetchQuotes skips HTTP status check

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/portfolio/WatchlistPanel.tsx:39–43
- **Detail**: No `r.ok` check before `r.json()`. On 401/500 the endpoint returns JSON error bodies; `body.data ?? {}` silently returns an empty map, all tickers show as "unavailable" with no distinction from a real outage. The mount `.catch()` is never triggered on auth failure.
- **Fix**: Insert `if (!r.ok) throw new Error(String(r.status))` before `r.json()` to route 4xx/5xx into the existing `.catch` handler.
- **Decision**: FIXED

### F2 — Flat day (d === 0) shows ▼ red loss indicator

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/portfolio/WatchlistPanel.tsx:281
- **Detail**: `gain = item.d !== null ? item.d >= 0 : null`. When `item.d === 0`, `gain` is `false` → pill renders "▼ 0.00%" in red. A flat day should be neutral.
- **Fix**: `const gain = item.d !== null ? (item.d > 0 ? true : item.d < 0 ? false : null) : null;` — uses existing null-path which renders "—".
- **Decision**: FIXED

### F3 — makeUnavailable uses c: 0 as a sentinel

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/portfolio/WatchlistPanel.tsx:45–47
- **Detail**: `c: 0` is never displayed (unavailable branch short-circuits), but misleads future readers who might not see the early-return guard.
- **Fix**: Change `c: 0` → `c: NaN` to make sentinel intent explicit.
- **Decision**: FIXED

### F4 — hasLoadedRef timing note

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/components/portfolio/WatchlistPanel.tsx:94–97
- **Detail**: `hasLoadedRef` is set in `.finally()` (a microtask), not tied to the render cycle. Safe under React 18 batched rendering; risk only if component moves to a Suspense/concurrent tree.
- **Fix**: Convert to state boolean if/when component moves to a Suspense tree.
- **Decision**: SKIPPED
