<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Lots Modal Implementation Plan

- **Plan**: context/changes/modal-add-edit-transaction/plan.md
- **Scope**: Phase 1 of 2
- **Date**: 2026-06-12
- **Verdict**: APPROVED
- **Findings**: 0 critical  0 warnings  1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — formatShares has no null/NaN guard unlike its peers

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency / Safety & Quality
- **Location**: src/lib/format.ts:1
- **Detail**: Both peers (pnlClass, formatSigned) accept `number | null` and return "—" for null. formatShares only accepts `number`. Currently safe because t.shares is Zod-validated non-null, but the parameter type diverges from the file's established convention.
- **Fix**: Add `if (n == null || isNaN(n)) return "—";` as the first line and widen parameter to `number | null` to match peer convention.
- **Decision**: FIXED — widened parameter to `number | null`, added null/NaN guard. TSC + lint pass.
