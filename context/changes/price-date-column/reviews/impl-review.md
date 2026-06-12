<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Price Date Column

- **Plan**: context/changes/price-date-column/plan.md
- **Scope**: Phase 1 of 1
- **Date**: 2026-06-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — `new Date(pos.priceDate)` can silently render "Invalid Date"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/transactions/DashboardView.tsx:41
- **Detail**: The null guard doesn't protect against an empty string or malformed timestamp. `new Date("").toLocaleDateString()` returns the literal "Invalid Date" string shown directly in the table cell. Current data flow (`fetched_at ?? null`) makes this unlikely but not impossible across schema changes or future data sources.
- **Fix**: Add `isNaN(new Date(pos.priceDate).getTime())` check before `toLocaleDateString` — return "—" if invalid.
- **Decision**: FIXED — added `isNaN(date.getTime())` guard in `formatPriceDate`

### F2 — Current Price column has no staleness signal after ⚠ removal

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/transactions/DashboardView.tsx:170
- **Detail**: With the ⚠ triangle removed, the Current Price number rendered in full-weight text even when stale. Only the adjacent Price Date cell was dimmed. A user who doesn't notice the grey date has no indication the price number is outdated.
- **Fix A ⭐ Applied**: Also apply `text-gray-400` to the Current Price `<td>` when `!pos.isFresh`.
  - Strength: Ties the staleness signal directly to the number being acted on.
  - Tradeoff: Dims the price number itself.
  - Confidence: MED
- **Fix B**: Leave as-is — dimmed date is sufficient context.
- **Decision**: FIXED via Fix A — Current Price cell now also dims when stale

### F3 — Inline ternary className produces trailing space

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/transactions/DashboardView.tsx:170–173
- **Detail**: Template-literal ternary `px-4 py-3 ${ ... }` produces a trailing space when `isFresh` is true. Other conditional-class cells use `pnlClass()` helper. Not a rendering bug but inconsistent.
- **Fix**: Write both states explicitly — `!pos.isFresh ? "px-4 py-3 text-gray-400" : "px-4 py-3"`.
- **Decision**: FIXED — both stale cells now use explicit two-state className strings

### F4 — `colSpan={9}` is a magic number

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/transactions/DashboardView.tsx:192
- **Detail**: Pre-existing issue made one step worse by this change. The number must be manually updated every time a column is added or removed. A comment would make future edits safer.
- **Fix**: Add a `{/* colSpan = number of header columns */}` comment, or introduce a `COLUMN_COUNT` constant.
- **Decision**: SKIPPED
