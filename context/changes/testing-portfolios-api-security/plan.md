# API security tests for /api/portfolios/[id] Implementation Plan

## Overview

Close two named security-test gaps for the `/api/portfolios/[id]` endpoint (PUT, DELETE):

1. **Unauthenticated guard (Risk #3):** no test exercises the middleware catch-all for PUT/DELETE on the specific-ID path. The existing `unauthenticated-api.integration.test.ts` proves the catch-all only for index paths (`/api/portfolios`, `/api/transactions`).
2. **IDOR DELETE (Risk #4):** `idor-write.integration.test.ts` tests cross-user UPDATE on portfolios but not DELETE.

Both gaps are filled by adding test cases that clone patterns already present in the same two files. No production code, no fixtures, no schema changes.

## Current State Analysis

- **Endpoint** (`src/pages/api/portfolios/[id].ts`): exports `PUT` (lines 9–78) and `DELETE` (lines 80–160), no GET. Each handler has a redundant-but-correct inline `context.locals.user` 401 guard; ownership is enforced entirely by RLS (`auth.uid() = user_id`).
- **Middleware** (`src/middleware.ts:4–6`): `PROTECTED_API_ROUTES = ["/api/"]` matched via `.startsWith` (line 26) already covers `/api/portfolios/<uuid>`. Unauthenticated requests receive `{ error: "Unauthorized" }` / 401.
- **RLS** (`supabase/migrations/20260613000000_create_portfolios.sql`): all four policies correct; UPDATE has both USING + WITH CHECK; DELETE has USING. No WITH-CHECK gap.
- **Existing auth-guard test** (`src/test/integration/unauthenticated-api.integration.test.ts`): `describe("Risk #3 …")` → `describe("PROTECTED_API_ROUTES catch-all …")` holds cases (a) GET `/api/portfolios` no-cookie → 401, (b) POST `/api/transactions` no-cookie → 401, (c) GET `/api/portfolios` garbage-cookie → 401. Invokes `onRequest` via the local `invoke()` helper and `makeContext(method, pathname, cookieHeader?)`. No PUT/DELETE, no `[id]` path.
- **Existing IDOR test** (`src/test/integration/idor-write.integration.test.ts`): three cases — transaction UPDATE, transaction DELETE, portfolio UPDATE (lines 66–84). The portfolio UPDATE oracle re-fetches `name` with User B's client and asserts `"Portfolio B"`. No portfolio DELETE.
- **Fixture** (`src/test/integration/helpers/users.ts:86–98`): seeds one portfolio per user; exposes `fixture.userB.portfolioId`; teardown cascades via `auth.admin.deleteUser()`. Sufficient as-is.

## Desired End State

`npm run test:integration` runs (with local Supabase up) and includes:

- Unauthenticated PUT and DELETE against `/api/portfolios/<uuid>` each return 401 with `next` not called (no-cookie), plus one garbage-cookie case.
- A cross-user DELETE attempt (User A deleting User B's portfolio) affects 0 rows, with an oracle proving User B's portfolio still exists with name `"Portfolio B"`.
- Test-plan §6.4 records `[id]` PUT/DELETE under the routes with middleware auth-guard coverage.

Verified by: both extended suites pass; lint + typecheck clean.

### Key Discoveries:

- The middleware catch-all (`startsWith("/api/")`) already covers `[id]` paths — the new guard tests verify behavior that exists, closing a _test_ gap, not a code gap (`src/middleware.ts:26`).
- The portfolio DELETE IDOR test needs no `portfolioSeed` oracle field; asserting the row still exists with `name === "Portfolio B"` is the sufficient oracle (research §6, cookbook §6.2 IDOR oracle rule).
- RLS makes a foreign row invisible → 0 affected rows, not a 403. Assert at the DB layer on affected-row count (cookbook §6.2 "404 not 403").

## What We're NOT Doing

- **Not** testing DELETE's 409-when-portfolio-has-transactions business logic (`src/pages/api/portfolios/[id].ts:104–120`) — that is business logic, not a security risk. Out of scope.
- **Not** adding a `GET /api/portfolios/[id]` test — no GET handler exists on the `[id]` route.
- **Not** changing the fixture, helpers, production code, middleware, or migrations.
- **Not** adding cross-user _read_ or IDOR _UPDATE_ tests for portfolios — already covered (`rls-cross-user.integration.test.ts`, `idor-write.integration.test.ts:66–84`).
- **Not** standing up a test server — the established pattern invokes `onRequest` directly.

## Implementation Approach

Extend the two existing integration files in place (chosen over a new file: both already hold portfolio cases, keeping tests co-located by concern per cookbook §6.2). Each new case is a structural clone of an adjacent existing case, swapping method/path/table. Finish by updating the test-plan cookbook so §6.4 reflects the new coverage.

## Phase 1: Unauthenticated guard for `/api/portfolios/[id]` (Risk #3)

### Overview

Prove the middleware catch-all rejects unauthenticated PUT and DELETE on the specific-ID path.

### Changes Required:

#### 1. Extend the unauthenticated-API guard suite

**File**: `src/test/integration/unauthenticated-api.integration.test.ts`

**Intent**: Add PUT and DELETE cases against a `/api/portfolios/<uuid>` path to prove the `PROTECTED_API_ROUTES` catch-all guards the specific-ID route for mutating methods, not just index paths. Mirrors the thoroughness of existing cases (a)/(b)/(c): both methods no-cookie → 401, plus one garbage-cookie case.

**Contract**: New `it` cases inside the existing `describe("PROTECTED_API_ROUTES catch-all: no valid session → 401")` block, using the file's `invoke()` helper and `makeContext("PUT" | "DELETE", "/api/portfolios/<uuid>", cookieHeader?)`. Assert `next` not called and `response.status === 401`; for one no-cookie case also assert the JSON body equals `{ error: "Unauthorized" }` (matching case (a)). Use any syntactically valid UUID literal for the path segment — the request is rejected before the handler parses it, so the value is irrelevant.

### Success Criteria:

#### Automated Verification:

- Integration suite passes: `npm run test:integration`
- Linting passes: `npm run lint`
- Type checking passes: `npm run typecheck` (or the project's typecheck script)

#### Manual Verification:

- New cases appear under the "Risk #3" describe block and read consistently with cases (a)–(c).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: IDOR DELETE on portfolios (Risk #4) + cookbook update

### Overview

Prove a cross-user DELETE on a portfolio affects zero rows and leaves User B's row intact; record the new coverage in the test plan.

### Changes Required:

#### 1. Add portfolio DELETE IDOR case

**File**: `src/test/integration/idor-write.integration.test.ts`

**Intent**: Add a case where User A attempts to DELETE User B's portfolio via the anon+JWT client and confirm 0 rows affected, with an oracle re-fetch under User B's client proving the portfolio still exists. Clones the existing transaction-DELETE case (lines 41–64) and the portfolio-UPDATE oracle shape (lines 66–84).

**Contract**: New `it` after the existing portfolio UPDATE case. `fixture.userA.client.from("portfolios").delete().eq("id", fixture.userB.portfolioId).select("*")` → `error` null, data length 0. Oracle: `fixture.userB.client.from("portfolios").select("name").eq("id", fixture.userB.portfolioId).single()` → `name === "Portfolio B"`. Reuses the existing `beforeAll`/`afterAll` fixture lifecycle — no new setup.

#### 2. Update cookbook coverage note

**File**: `context/foundation/test-plan.md`

**Intent**: Reflect that `/api/portfolios/[id]` PUT/DELETE now has middleware auth-guard test coverage and portfolio DELETE IDOR is covered, so future contributors don't re-open these as gaps.

**Contract**: In §6.4, extend the "Routes with middleware auth-guard coverage" line to include `/api/portfolios/[id]` (PUT/DELETE). Optionally add a one-line note under §6.2 reference tests that portfolio DELETE IDOR is covered in `idor-write.integration.test.ts`. Prose-only edit; do not alter §1–§5 frozen strategy.

### Success Criteria:

#### Automated Verification:

- Integration suite passes: `npm run test:integration`
- Linting passes: `npm run lint`
- Type checking passes: `npm run typecheck` (or the project's typecheck script)

#### Manual Verification:

- The DELETE IDOR case sits beside the portfolio UPDATE case and uses the User-B re-fetch oracle (not the write response) to confirm non-deletion.
- §6.4 coverage line names `/api/portfolios/[id]`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Testing Strategy

### Integration Tests:

- Unauthenticated PUT/DELETE on `/api/portfolios/<uuid>` → 401 via `onRequest` (no server).
- Cross-user DELETE on portfolio → 0 rows affected; oracle confirms row intact.

### Manual Testing Steps:

1. With local Supabase running (`supabase start`), run `npm run test:integration` and confirm all cases green, including the new ones.
2. Confirm the new auth-guard cases fail if the `[id]` path were ever removed from middleware coverage (sanity: temporarily narrow `PROTECTED_API_ROUTES` locally — revert after).

## References

- Research: `context/changes/testing-portfolios-api-security/research.md`
- Test plan cookbook: `context/foundation/test-plan.md` §6.2, §6.4
- Reference cases: `src/test/integration/unauthenticated-api.integration.test.ts:13–40`, `src/test/integration/idor-write.integration.test.ts:41–84`
- Endpoint: `src/pages/api/portfolios/[id].ts:9–160`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Unauthenticated guard for /api/portfolios/[id] (Risk #3)

#### Automated

- [x] 1.1 Integration suite passes: `npm run test:integration`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 Type checking passes: `npm run typecheck`

#### Manual

- [x] 1.4 New cases appear under the "Risk #3" describe block and read consistently with cases (a)–(c)

### Phase 2: IDOR DELETE on portfolios (Risk #4) + cookbook update

#### Automated

- [ ] 2.1 Integration suite passes: `npm run test:integration`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Type checking passes: `npm run typecheck`

#### Manual

- [ ] 2.4 DELETE IDOR case uses the User-B re-fetch oracle to confirm non-deletion
- [ ] 2.5 §6.4 coverage line names `/api/portfolios/[id]`
