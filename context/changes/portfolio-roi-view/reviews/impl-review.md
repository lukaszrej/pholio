<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Portfolio ROI View

- **Plan**: context/changes/portfolio-roi-view/plan.md
- **Scope**: All Phases (1–4 of 4)
- **Date**: 2026-06-10
- **Verdict**: NEEDS ATTENTION → resolved via triage
- **Findings**: 0 critical  6 warnings  4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — API key appended as URL query parameter in fetchQuote

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/finnhub.ts:14
- **Detail**: Finnhub token embedded in URL (?token=...). Platform auto-logs outgoing fetch URLs on error, exposing the key in plaintext. Finnhub supports X-Finnhub-Token header as equivalent.
- **Fix A ⭐ Recommended**: Move token to `X-Finnhub-Token` request header.
  - Strength: Key never enters the URL; protected from platform log leaks.
  - Tradeoff: One-line change; functionally identical.
  - Confidence: HIGH — Finnhub documents this header as equivalent.
  - Blind spot: None significant.
- **Fix B**: Keep query param, suppress platform logs.
  - Strength: Zero code change.
  - Tradeoff: Platform log config is fragile; key still in error stack traces.
  - Confidence: LOW.
  - Blind spot: Dev machine logs, third-party error trackers.
- **Decision**: FIXED via Fix A

### F2 — Finnhub fetches fire concurrently with no rate-limit handling

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:28–46
- **Detail**: Promise.allSettled fires all unique-ticker fetches simultaneously. Finnhub free tier = 60 req/min. User with >60 tickers gets silent 429s causing positions to show — or stale prices with no indication.
- **Fix A ⭐ Recommended**: Add concurrency cap with p-limit (concurrency=10).
  - Strength: Prevents 429 bursts; page time stays bounded.
  - Tradeoff: New dependency; minimal code change.
  - Confidence: HIGH — standard pattern for rate-bounded parallel fetches.
  - Blind spot: No retry-with-backoff.
- **Fix B**: Document as known limitation, address in S-05.
  - Strength: Zero code change.
  - Tradeoff: First user with >60 tickers sees silently wrong data.
  - Confidence: MEDIUM.
  - Blind spot: No alerting when failure mode triggers.
- **Decision**: FIXED via Fix A

### F3 — Division by zero possible in computePositions avgCost

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/portfolio.ts:38
- **Detail**: avgCost divides by totalShares. If every transaction in a group has shares = 0 (bypasses Zod via direct DB insert), totalShares = 0 and avgCost = NaN propagates silently through all ROI calculations.
- **Fix**: Guard the division: `const avgCost = totalShares > 0 ? weightedSum / totalShares : 0;`
- **Decision**: FIXED

### F4 — Transactions DB error silently dropped on dashboard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:12
- **Detail**: result?.error never checked. DB failure is indistinguishable from "you have no transactions."
- **Fix**: Add `if (result?.error) { console.error(...) }` before transactions assignment.
- **Decision**: FIXED

### F5 — Unbounded select("*") on transactions

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:12
- **Detail**: No .limit() on transactions query. Unbounded result on every page load, fed into computePositions with no cap.
- **Fix**: Add `.limit(500)` to the query.
- **Decision**: FIXED

### F6 — Schema refactor across 4 files not documented in change.md

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/transaction-schema.ts, src/types/transaction.ts, src/components/transactions/AddTransactionForm.tsx, src/pages/api/transactions/index.ts
- **Detail**: CURRENCIES moved to transaction-schema.ts, Currency type derived from it, NewTransaction/UpdateTransaction utility types added. Not mentioned in plan or change.md (middleware fix was documented; schema refactor was not).
- **Fix**: Add note to change.md documenting the schema refactor.
- **Decision**: FIXED

### F7 — json.data not null-checked before passing to onSuccess

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/transactions/AddTransactionForm.tsx:55–56
- **Detail**: `as { data: Transaction }` cast + immediate onSuccess(json.data) — if API returns { data: null }, null is pushed into transactions array, crashing table render.
- **Fix**: Add null guard before onSuccess; update type cast to `{ data: Transaction | null }`.
- **Decision**: FIXED

### F8 — Raw Supabase error message surfaced to API client

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/transactions/index.ts:50
- **Detail**: DB errors returned as { error: dbError.message } for 500-class responses. Constraint violation messages can expose column names and schema detail.
- **Fix**: Return generic "Internal server error" for 500-class errors; log detail server-side only.
- **Decision**: FIXED

### F9 — prices state frozen after mount — limitation undocumented in code

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/transactions/DashboardView.tsx:40
- **Detail**: `const [prices] = useState(initialPrices)` discards setter. New tickers added optimistically show — permanently until hard reload. Intentional per plan scope but undocumented.
- **Fix**: Add inline comment explaining the design intent.
- **Decision**: FIXED

### F10 — npm run lint reports no-console warnings

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/finnhub.ts:27, src/pages/dashboard.astro:40
- **Detail**: Intentional console.error calls trigger no-console lint rule (warnings, CI passes). F4 fix added a third instance.
- **Fix**: Add `// eslint-disable-next-line no-console` above each console.error.
- **Decision**: FIXED
