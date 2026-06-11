<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Sector Allocation Chart

- **Plan**: context/changes/sector-allocation-chart/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-06-11
- **Verdict**: NEEDS ATTENTION (resolved via triage)
- **Findings**: 0 critical  3 warnings  2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — `sector` column accepts empty string

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260610000000_create_sectors.sql:4
- **Detail**: `sector TEXT NOT NULL` accepts empty string. Phase 2 app code skips caching empty sectors, but a DB-level CHECK provides defense-in-depth.
- **Fix**: Add CHECK (sector <> '') via new migration.
- **Decision**: FIXED — 20260611000000_add_sectors_constraints.sql

### F2 — `ticker` PRIMARY KEY accepts empty string

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260610000000_create_sectors.sql:3
- **Detail**: Same empty-string gap on the PK column.
- **Fix**: CHECK (ticker <> '') bundled with F1.
- **Decision**: FIXED — 20260611000000_add_sectors_constraints.sql

### F3 — Write policies allow any authenticated user to mutate global cache

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260610000000_create_sectors.sql:16–23
- **Detail**: INSERT/UPDATE policies use `auth.role() = 'authenticated'`. Mirrors prices pattern by design (plan required it). Sector data is cosmetic/low-stakes.
- **Fix A ⭐**: Document intent in migration comment.
- **Decision**: FIXED (Fix A) — comment added to 20260610000000_create_sectors.sql

### F4 — UPDATE policy WITH CHECK pre-empted the prices fix-migration lesson

- **Severity**: ℹ️ OBSERVATION
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260610000000_create_sectors.sql:22–25
- **Detail**: Positive finding. sectors migration correctly includes both USING and WITH CHECK on UPDATE, pre-empting the fix needed for prices.
- **Decision**: ACCEPTED-AS-RULE — lesson added to context/foundation/lessons.md

### F5 — No DELETE policy is correct but undocumented

- **Severity**: ℹ️ OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260610000000_create_sectors.sql (file level)
- **Detail**: No DELETE policy is intentional for a upsert-only cache table; needs a comment.
- **Fix**: Add comment after last policy block.
- **Decision**: FIXED — comment added to 20260610000000_create_sectors.sql
