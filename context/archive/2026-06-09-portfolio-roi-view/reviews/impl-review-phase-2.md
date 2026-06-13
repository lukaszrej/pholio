<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Portfolio ROI View

- **Plan**: context/changes/portfolio-roi-view/plan.md
- **Scope**: Phase 2 of 4
- **Date**: 2026-06-09
- **Verdict**: APPROVED
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

### F1 — API key transmitted as URL query parameter

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/finnhub.ts:13
- **Detail**: `token=${FINNHUB_API_KEY}` is embedded in the URL query string. Finnhub's API requires this form (no Authorization header support). If error logging is added later that logs the request URL, the key would leak in plaintext.
- **Fix**: Add inline comment marking the risk so future logging code knows to redact or exclude the URL.
- **Decision**: FIXED — added comment `// token in query string — Finnhub requires this form; do not log this URL`

### F2 — Bare type assertion on Finnhub JSON response

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/finnhub.ts:19
- **Detail**: `(await response.json()) as { c: number }` had no runtime shape guard. If Finnhub returned a non-object payload (rate-limit plain string, null body), `data` would throw before the `!data.c` guard could protect it.
- **Fix**: Cast to `unknown` first, then guard with `typeof json !== "object" || json === null`, then cast to `{ c: number }`.
- **Decision**: FIXED — restructured to use `const json: unknown` with runtime null/object guard before narrowing.

### F3 — Zero-price suppression silently discards valid data point

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/finnhub.ts:21
- **Detail**: `!data.c || data.c === 0` treats a zero price as missing data. The plan documents this (Finnhub returns c=0 for invalid tickers / no market activity), but no comment existed in the code. A future reader might remove the guard as redundant.
- **Fix**: Add explanatory comment.
- **Decision**: FIXED — added `// c === 0 means no market data for this symbol`

### F4 — Silent catch produces no log signal on production failures

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/finnhub.ts:24
- **Detail**: Every failure path (timeout, DNS error, non-JSON body, abort) was swallowed and returned null. On Cloudflare Workers, a broken Finnhub integration would silently show stale cached prices with no log evidence.
- **Fix**: Add `console.error("[finnhub] fetchQuote failed", ticker, e)` inside catch.
- **Decision**: FIXED — console.error added; no-console produces a warning (acceptable per project ESLint config which sets this to "warn").
