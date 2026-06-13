<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Sortable Portfolio Table

- **Plan**: context/changes/sortable-portfolio-table/plan.md
- **Scope**: Phase 1 of 1
- **Date**: 2026-06-13
- **Verdict**: NEEDS ATTENTION (resolved via triage)
- **Findings**: 0 critical · 2 warnings · 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Inline onClick wrappers recreated on every render

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: DashboardView.tsx:183–231
- **Detail**: Each sortable `<th>` used inline arrow wrappers; `handleSortClick` was a plain function declaration (not `useCallback`), reallocating on every render.
- **Fix**: Wrapped `handleSortClick` in `useCallback([sortKey, sortDir])` and added `useCallback` to the React import.
- **Decision**: FIXED

### F2 — SortKey type defined inside component body

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: DashboardView.tsx:65–73 (original)
- **Detail**: `type SortKey` was declared inside the component function body. Every other type in the file and sibling components is at module scope.
- **Fix**: Moved `type SortKey` to module scope (above `export default function DashboardView`). Also moved `sortKey`/`sortDir` useState calls up to the grouped useState block as a side-effect.
- **Decision**: FIXED

### F3 — sortIcon helper declared inside component body

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: DashboardView.tsx:98–105 (original)
- **Detail**: `sortIcon` was a pure render helper declared inside the component, redeclared every render. Extracted from inline JSX (a reasonable DRY choice) but placement added unnecessary allocation.
- **Fix**: Extracted `sortIcon` to module scope, accepting `sortKey` and `sortDir` as parameters. Updated all 7 call sites.
- **Decision**: FIXED

### F4 — Sort comparator assumes all non-null values are numeric

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: DashboardView.tsx:93 (original)
- **Detail**: Comparator used `bVal - aVal` with no type guard. All current SortKey fields are numeric, so safe today; if SortKey ever gains a string field the subtraction silently produces NaN.
- **Fix**: Added explicit `as number` casts to make the numeric assumption explicit. A string-branch guard was attempted but rejected because TypeScript correctly narrows current SortKey values to `number`, making the branch unreachable with current types.
- **Decision**: FIXED

### F5 — Sort state declared after derived memos

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: DashboardView.tsx (state ordering)
- **Detail**: `sortKey` and `sortDir` state were declared after the `positions`/`sectorSlices`/`portfolioSummary` useMemo calls, intermixing primary state with derived state.
- **Decision**: ACCEPTED — resolved as side-effect of F2 fix; sort state is now grouped with all other useState calls.
