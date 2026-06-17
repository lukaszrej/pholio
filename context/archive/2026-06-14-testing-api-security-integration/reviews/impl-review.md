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
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Notable Passes

- Service-role client isolated to fixture only — `admin` client (service-role key) used exclusively in `helpers/users.ts` for create/delete. Returned `userA.client`/`userB.client` are anon+JWT clients; RLS applies to every assertion.
- Negative assertion present and correctly structured — `rls-cross-user.ts` queries by User B's exact id under User A's client: `expect(data).toHaveLength(0)`. Both tables covered.
- IDOR oracle is a re-fetch, not the write response — `idor-write.ts` re-fetches with `fixture.userB.client` after both UPDATE and DELETE attempts, comparing against `fixture.userB.transactionSeed`.
- Middleware `next` correctly gated — `unauthenticated-api.ts` asserts `next` NOT called for protected routes, IS called for `/api/auth/*`.
- Automated criteria: typecheck 0 errors; lint 0 errors; unit suite 25/25; §6.2 and §6.4 fully populated; integration files excluded from `npm test`.

## Findings

### F1 — Teardown console.error triggers lint warning and doesn't halt on failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/test/integration/helpers/users.ts:137
- **Detail**: Prior review F2 fix added `console.error` for teardown failures. The `console.error` generated a `no-console` lint warning. Additionally, `allSettled` without re-throw means CI passes green with orphaned test users.
- **Fix**: Replace `console.error` with a thrown aggregate error — collect `rejected` results and throw a single `Error` if any exist. Eliminates lint warning and silent failure.
- **Decision**: FIXED

---

### F2 — Portfolio INSERT seeds with explicit user_id — INSERT RLS not verified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/test/integration/helpers/users.ts:86-98
- **Detail**: Fixture seeds portfolios via authenticated client with `user_id: userAId` explicitly. Suite relies on INSERT RLS having `WITH CHECK (auth.uid() = user_id)`. If missing, authenticated users could insert rows owned by others. Test suite did not verify this constraint.
- **Fix A ⭐ Applied**: Added negative INSERT test in `rls-cross-user.integration.test.ts` — User A's client attempts `portfolios.insert({ user_id: userB.userId, ... })` and asserts error is not null.
  - Strength: Closes the INSERT surface alongside existing SELECT/UPDATE/DELETE coverage.
  - Tradeoff: One extra test case.
  - Confidence: HIGH
  - Blind spot: Need live Supabase to verify exact error code.
- **Decision**: FIXED via Fix A

---

### F3 — Migration revokes only SELECT from anon on user tables

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260617000000_revoke_anon_grants_user_data.sql
- **Detail**: Migration revokes `SELECT` from `anon` on `transactions` and `portfolios`. INSERT/UPDATE/DELETE revokes were missing — but investigation confirmed the original grant migration (20260615000000) only ever granted `SELECT` to `anon` on these tables, so the revoke migration already covered the full surface.
- **Fix**: Added comment to migration confirming INSERT/UPDATE/DELETE were never issued to `anon` on these tables.
- **Decision**: FIXED

---

### F4 — Middleware test case (d) doesn't assert response status 200

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/test/integration/unauthenticated-api.integration.test.ts:49
- **Detail**: Case (d) asserts `next` was called once and `status !== 401`. If `next` returned a 500, the test would still pass. Adding `expect(response.status).toBe(200)` would make the pass-through intent unambiguous.
- **Fix**: Add `expect(response.status).toBe(200)` to case (d).
- **Decision**: SKIPPED

---

### F5 — astro-middleware.ts stub not documented in plan

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/test/stubs/astro-middleware.ts
- **Detail**: Plan did not list this stub as a deliverable. `src/middleware.ts` imports `defineMiddleware` from `astro:middleware`; without a virtual-module stub, Vitest cannot import the middleware in Node mode. Purely additive and test-only.
- **Fix**: Annotated plan's "What We're NOT Doing" section with a discovered-prerequisite note — same treatment as the grant migration annotation.
- **Decision**: FIXED

---

### F6 — change.md status is impl_reviewed not implemented

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/testing-api-security-integration/change.md:4
- **Detail**: Plan Phase 4 specified `status: implemented`. Actual status is `impl_reviewed` — status was advanced by the prior review cycle. Not a regression; `impl_reviewed` is more informative.
- **Fix**: None required.
- **Decision**: SKIPPED
