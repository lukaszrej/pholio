<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Portfolio ROI View

- **Plan**: context/changes/portfolio-roi-view/plan.md
- **Scope**: Phase 3 of 4
- **Date**: 2026-06-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 1 warning 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Unplanned middleware.ts change: auth route exemption

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/middleware.ts:6
- **Detail**: Phase 3 plan does not mention middleware.ts. The change adds `PUBLIC_API_ROUTES = ["/api/auth/"]` and skips the auth guard for those paths — fixing a real latent bug where /api/auth/signin, signup, callback would return 401 to unauthenticated users. The fix is correct but undocumented, and widens the public API surface via `startsWith("/api/auth/")`.
- **Fix A ⭐ Recommended**: Add a plan addendum documenting the middleware bug fix.
  - Strength: Makes future reviewers aware /api/auth/ is explicitly public by design.
  - Tradeoff: Plan becomes a slightly moving target.
  - Confidence: HIGH — addendum pattern used in prior slices.
  - Blind spot: Doesn't prevent future /api/auth/ routes from being silently public.
- **Fix B**: Move the change to its own commit with explicit note in change.md.
  - Strength: Clean commit history.
  - Tradeoff: Git rewrite needed; more noise than signal for a trivial change.
  - Confidence: LOW — change is already committed on main.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix B — added explicit note to `context/changes/portfolio-roi-view/change.md` documenting the bug fix, the design rationale, and the `startsWith` surface implication.

### F2 — Unplanned finnhub.ts Phase 2 fixes bundled into Phase 3 commit

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/finnhub.ts
- **Detail**: Four fixes from impl-review-phase-2.md (URL comment, JSON shape guard, c=0 comment, error logging) are applied in the Phase 3 commit. All are correct and fully documented in reviews/impl-review-phase-2.md with FIXED decisions. Only issue is they appear as undocumented scope in the Phase 3 commit diff.
- **Fix**: No code change needed. Acknowledge as accepted.
- **Decision**: SKIPPED — already documented in Phase 2 review.

### F3 — Upsert result error silently discarded

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:39
- **Detail**: `await sb.from("prices").upsert(...)` result was not destructured. If upsert fails (RLS violation, connection error), the error was silently dropped with no log signal — causing a silent repeat Finnhub call on every subsequent page load. The in-memory prices[ticker] was still correct for the current request.
- **Fix**: Destructure `{ error: upsertErr }` and log with `console.error("[prices] upsert failed", ticker, upsertErr.message)`.
- **Decision**: FIXED — error destructuring and console.error added to dashboard.astro:39.
