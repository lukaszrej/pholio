<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: API Security Integration Tests

- **Plan**: context/changes/testing-api-security-integration/plan.md
- **Scope**: All Phases (1–4 of 4)
- **Date**: 2026-06-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Notable Passes

- Service-role client isolated to fixture only — `admin` client (service-role key) used exclusively in `helpers/users.ts` for create/delete. Returned `userA.client`/`userB.client` are anon+JWT clients; RLS applies to every assertion.
- Negative assertion present and correctly structured — `rls-cross-user.ts` queries by User B's exact id under User A's client: `expect(data).toHaveLength(0)`. Both tables covered.
- IDOR oracle is a re-fetch, not the write response — `idor-write.ts` re-fetches with `fixture.userB.client` after both UPDATE and DELETE attempts, comparing against `fixture.userB.transactionSeed`.
- Middleware `next` correctly gated — `unauthenticated-api.ts` asserts `next` NOT called for protected routes, IS called for `/api/auth/*`.
- No secrets hardcoded — all env vars from `process.env`; `.env.test` gitignored.

## Findings

### F1 — supabase/migrations/ modified despite scope guardrail

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: supabase/migrations/20260615000000_grant_table_permissions.sql
- **Detail**: Plan stated "supabase/migrations/ are untouched." Migration adds GRANT SELECT/INSERT/UPDATE/DELETE on transactions, prices, sectors, portfolios to authenticated, service_role, and anon. Discovered prerequisite — Supabase CLI 2.x does not auto-grant in local dev; tests fail with permission-denied without it. Non-destructive (additive only).
- **Fix Applied**: Annotated the plan's "What We're NOT Doing" section with the discovered-prerequisite rationale.
- **Decision**: FIXED

---

### F2 — Teardown silently swallows deleteUser failures

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/test/integration/helpers/users.ts:131
- **Detail**: `Promise.allSettled` with no rejection handling. Failed deletions are silently dropped; orphaned `integration-user-*@test.invalid` accounts accumulate in local Supabase without diagnostic signal.
- **Fix Applied**: Added rejection logging after `allSettled` in `teardown()`.
- **Decision**: FIXED

---

### F3 — Vitest config uses two-file approach instead of projects split

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: vitest.config.ts, vitest.integration.config.ts, package.json:16
- **Detail**: Plan specified a `projects:` array inside `vitest.config.ts`. Implementation created a separate `vitest.integration.config.ts` and uses `--config` flag. Functional outcome identical. Two-file approach may be preferable for independent config isolation.
- **Decision**: SKIPPED

---

### F4 — anon SELECT grant on sensitive tables is unnecessary

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260615000000_grant_table_permissions.sql
- **Detail**: anon SELECT granted on transactions and portfolios. With RLS and `auth.uid() = user_id` policies, no actual exposure today. But if RLS is accidentally disabled, anon clients could read all rows. No public-read endpoint exists for these tables.
- **Fix Applied**: Created `supabase/migrations/20260617000000_revoke_anon_grants_user_data.sql` to revoke anon SELECT on transactions and portfolios. Prices and sectors retain anon SELECT (reference/market data).
- **Decision**: FIXED

---

### F5 — DELETE oracle omits purchase_date and shares fields

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/test/integration/idor-write.integration.test.ts:56-61
- **Detail**: UPDATE oracle checks all 5 fields against seed; DELETE oracle only checked 3. Plan says "compare field-for-field to the seeded value."
- **Fix Applied**: Added `purchase_date` and `shares` assertions to DELETE oracle.
- **Decision**: FIXED

---

### F6 — Lint fails on working tree from uncommitted in-progress changes

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/portfolio.test.ts:11, src/lib/prices.ts:15, src/test/stubs/astro-env-server.ts:5
- **Detail**: `npm run lint` fails with 3 errors from uncommitted `testing-external-dependency-resilience` work. Committed state of this change passed lint. Heads-up: in-progress work changes `FINNHUB_API_KEY` from `const` to `let` in `astro-env-server.ts`, but the variable is never reassigned in that file — the `vi.mock` factory pattern is the correct override mechanism, not `let` reassignment. Revert the `const→let` change in the next change's commits.
- **Decision**: SKIPPED (not this change's issue)
