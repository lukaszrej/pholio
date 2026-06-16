<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Ticker Tape Daily % Change

- **Plan**: context/changes/ticker-tape-daily-change/plan.md
- **Scope**: Phase 1 + 2 of 2 (full plan)
- **Date**: 2026-06-16
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 4 observations

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

### F1 — Loose type cast in fetchQuote hides missing-field risk

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality / Pattern Consistency
- **Location**: src/lib/finnhub.ts:52
- **Detail**: `json as { c: number; dp: number }` asserted both fields as present numbers. If Finnhub returns `{ c: 100 }` with no `dp` key, TypeScript would not warn. Diverged from `fetchSector`'s `{ finnhubIndustry?: string }` defensive-cast pattern in the same file.
- **Fix**: Changed cast to `{ c?: unknown; dp?: unknown }` and tightened guard to `typeof data.c !== "number" || data.c === 0`.
- **Decision**: FIXED

### F2 — Supabase cache-read error silently discarded in prices.ts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/prices.ts:15
- **Detail**: `const { data: cachedRows } = await supabase.from("prices")...` omitted `error` from the destructure. DB outages were invisible in logs; the function silently fired Finnhub calls for every ticker. The upsert on line 44 already logged errors — the read skipped the same discipline.
- **Fix**: Added `error: cacheErr` to destructure with `console.error("[prices] cache read failed", cacheErr.message)`.
- **Decision**: FIXED

### F3 — Integration test assertions don't verify change_pct written to DB

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/test/integration/prices.integration.test.ts:85-91
- **Detail**: Plan said "account for change_pct in assertions about the upserted/returned row shape." PricesRow interface was widened but row assertions only checked `price` and `fetched_at`. No successful Finnhub stub returning `dp` existed; if change_pct silently stopped being upserted, no test would catch it.
- **Fix**: Added test case `(c)` — stubs Finnhub quote with `dp: 1.23`, asserts `result[ticker].changePct === 1.23`, asserts DB row `change_pct === 1.23`, asserts `computePositions` propagates `changePct`.
- **Decision**: FIXED via Fix A

### F4 — React key uses array index on doubled animation list

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/transactions/DashboardView.tsx:55
- **Detail**: TickerTape rendered `[...items, ...items]` keyed by index. Technically unique but doesn't encode ticker identity; fragile if doubling strategy changes.
- **Fix**: Changed to `key={`${p.ticker}-${i}`}`.
- **Decision**: FIXED

### F5 — Migration file has no explanatory comment

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260616000000_add_change_pct_to_prices.sql
- **Detail**: Prior ALTER TABLE migrations include a comment explaining the rationale and why the column is nullable. This migration is a single statement with no comment.
- **Fix**: N/A
- **Decision**: SKIPPED

### F6 — Cache freshness comparison doesn't normalise timestamp timezone

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/prices.ts:31
- **Detail**: `cached.fetched_at.split("T")[0] === today` compared the raw stored string. If Supabase returned a non-UTC offset, the split could extract the wrong date.
- **Fix**: Changed to `new Date(cached.fetched_at).toISOString().split("T")[0] === today`. Also removed the optional-chaining on `cached` since the condition is now inside an explicit `if (cached &&...)` check.
- **Decision**: FIXED
