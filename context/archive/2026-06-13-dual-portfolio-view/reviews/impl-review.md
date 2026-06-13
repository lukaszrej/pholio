<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Multi-Portfolio System

- **Plan**: context/changes/dual-portfolio-view/plan.md
- **Scope**: Phases 1–3 of 4
- **Date**: 2026-06-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 3 warnings 3 observations

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

### F1 — maybeSingle() error silently dropped in portfolio ownership checks

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/transactions/index.ts:42–47, src/pages/api/transactions/[id].ts:51–56
- **Detail**: Both routes destructured only `data` from `.maybeSingle()`, discarding `error`. A DB timeout or network fault would return a misleading 400 "Portfolio not found" with no server log entry.
- **Fix Applied**: Destructured `portfolioLookupError`; returns 500 + console.error if truthy, then checks `!portfolioRow` for the genuine 400 path.
- **Decision**: FIXED via Fix A

### F2 — Raw Postgres error messages returned to clients on constraint violations

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/portfolios/index.ts:91, src/pages/api/transactions/index.ts:67
- **Detail**: On 23xxx constraint violations, both routes returned `dbError.message` verbatim, leaking Postgres schema detail (column/constraint names).
- **Fix Applied**: Replaced `dbError.message` with `"Invalid request"` in the 23xxx branch of both files.
- **Decision**: FIXED

### F3 — TOCTOU race in DELETE /api/portfolios/[id] returns 500 not 409

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/portfolios/[id].ts:131–143
- **Detail**: Between the pre-flight count returning 0 and the delete executing, a concurrent insert could cause the FK ON DELETE RESTRICT to fire a 23503 error, which fell through to a generic 500.
- **Fix Applied**: Added `dbError.code === "23503"` check before the generic 500 fallback; returns 409 with the same user-friendly message as the pre-flight check.
- **Decision**: FIXED

### F4 — Zod v4 API: z.uuid() used instead of z.string().uuid()

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/transaction-schema.ts
- **Detail**: Plan specified `z.string().uuid("Invalid portfolio ID")` (Zod v3 form). Implementation used `z.uuid({ message: "Invalid portfolio ID" })` — the correct Zod v4 standalone API. Functionally identical; implementation is more idiomatic.
- **Decision**: ACCEPTED-AS-RULE: "In Zod v4, use z.uuid() not z.string().uuid()" (saved to context/foundation/lessons.md)

### F5 — portfolio_id ownership enforced only at app layer, not in RLS

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: supabase/migrations/20260613000001_add_portfolio_id_to_transactions.sql
- **Detail**: The transactions RLS UPDATE policy does not verify that portfolio_id refers to a portfolio the same user owns. Defence lives entirely in the API layer's maybeSingle() ownership check. DB-level enforcement would require a WITH CHECK subquery on the UPDATE policy.
- **Decision**: ACCEPTED — app-layer defence deemed sufficient

### F6 — Phase 4 work in progress in working tree

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/portfolio/PortfolioSection.tsx (untracked), src/components/transactions/DashboardView.tsx, src/components/portfolio/PortfolioSummaryCard.tsx, src/pages/dashboard.astro (modified, not staged)
- **Detail**: Phase 4 implementation is underway in the working tree; all changes align with Phase 4's "Changes Required". Build and lint pass. Manual verification items 4.3–4.9 are pending.
- **Decision**: SKIPPED
