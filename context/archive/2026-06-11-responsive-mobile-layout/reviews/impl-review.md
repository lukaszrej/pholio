<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Responsive Mobile Layout

- **Plan**: context/changes/responsive-mobile-layout/plan.md
- **Scope**: Phase 1 + Phase 2 of 2
- **Date**: 2026-06-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  2 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — window.matchMedia called without an existence guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/portfolio/SectorAllocationChart.tsx:29
- **Detail**: `window.matchMedia` called inside useEffect with no guard. In jsdom (default test environment), matchMedia is undefined — any test that renders this component without mocking it throws a TypeError. Works correctly in-browser; risk is test-time only.
- **Fix**: Add `if (!window.matchMedia) return;` as the first line of the useEffect body.
  - Strength: One line; makes the hook safe in jsdom and any non-browser context. No change in browser behaviour.
  - Tradeoff: Silently skips media-query subscription in jsdom, leaving isSmall as false — fine for unit tests.
  - Confidence: HIGH — same guard pattern used across web projects for matchMedia.
  - Blind spot: None significant.
- **Decision**: FIXED

### F2 — Plan specifies `npm run typecheck` but that script does not exist

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/responsive-mobile-layout/plan.md (both Phase 1 and Phase 2 automated criteria)
- **Detail**: Both phases list `npm run typecheck` as an automated success criterion. The project had no such script — the correct command is `npx astro check` (0 errors confirmed). Added `"typecheck": "astro check"` to package.json so the plan's command is now runnable.
- **Fix**: Added `"typecheck": "astro check"` to package.json scripts.
  - Strength: Makes plan self-consistent; `npm run typecheck` is idiomatic and CI-friendly.
  - Tradeoff: Minor — one script entry added.
  - Confidence: HIGH — `astro check` is the correct type-check command for this Astro project.
  - Blind spot: None.
- **Decision**: FIXED

### F3 — useIsSmall: named closure instead of plan's inline handler

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/portfolio/SectorAllocationChart.tsx:28-35
- **Detail**: Plan specified an inline handler `(e: MediaQueryListEvent) => setIsSmall(e.matches)`. Implementation used a named `update` closure instead. Functionally equivalent; implementation was reverted to match the plan's pattern.
- **Fix**: Rewrote to use plan's inline handler pattern.
- **Decision**: FIXED

### F4 — legendPosition extracted as typed variable instead of inline cast

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/portfolio/SectorAllocationChart.tsx:68
- **Detail**: Plan specified `position: (isSmall ? "bottom" : "right") as "bottom" | "right"` inline. Implementation extracted a named `legendPosition` variable with an explicit type annotation. Functionally identical; the annotation avoids an `as` cast which is cleaner TypeScript.
- **Decision**: SKIPPED

### F5 — SSR initial `false` state relies implicitly on client:load directive

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/portfolio/SectorAllocationChart.tsx:27
- **Detail**: `useState(false)` initialises isSmall to the desktop assumption so server and first-client renders agree. Safety relies on the component always being rendered with a deferred Astro directive. No current breakage; implicit contract not documented in component.
- **Decision**: SKIPPED
