---
date: 2026-06-25T00:00:00+00:00
researcher: Claude Sonnet 4.6
git_commit: edf9173c1f4a857af3ce13497931bd7eac5e1046
branch: main
repository: Pholio
topic: "Security test grounding for /api/portfolios/[id] (PUT, DELETE)"
tags: [research, security, api, portfolios, rls, idor, authentication]
status: complete
last_updated: 2026-06-25
last_updated_by: Claude Sonnet 4.6
---

# Research: Security test grounding for /api/portfolios/[id]

**Date**: 2026-06-25
**Researcher**: Claude Sonnet 4.6
**Git Commit**: edf9173c1f4a857af3ce13497931bd7eac5e1046
**Branch**: main
**Repository**: Pholio

## Research Question

Ground the security tests for the new `/api/portfolios/[id]` endpoint: identify the endpoint's
HTTP methods and auth/ownership strategy, confirm what middleware and RLS provide, establish
exactly which security scenarios are already covered by existing tests, and identify the genuine
gaps that the new change must fill.

## Summary

`/api/portfolios/[id]` supports **PUT and DELETE** (no GET on the [id] route; GET lives on the
index). Both handlers carry an inline session check and delegate ownership enforcement entirely
to RLS. Middleware's `PROTECTED_API_ROUTES = ["/api/"]` with `startsWith` already protects the
path. All four RLS policies on `portfolios` are correct (UPDATE has both USING + WITH CHECK).

**Two genuine gaps** exist in the test suite:

1. No test explicitly calls `makeContext("PUT" | "DELETE", "/api/portfolios/<uuid>")` through
   the middleware layer — the existing unauthenticated-API test covers the index path only.
2. IDOR DELETE on portfolios is untested — `idor-write.integration.test.ts` covers UPDATE but
   not DELETE.

Cross-user read and IDOR UPDATE on portfolios are already covered at the Supabase-client layer
and do not need new tests.

---

## Detailed Findings

### 1. The endpoint: `/api/portfolios/[id].ts`

**File**: `src/pages/api/portfolios/[id].ts` (160 lines)

**HTTP methods exported**: `PUT` (lines 9–78) and `DELETE` (lines 80–160). No GET, PATCH, or
POST.

**Inline auth guard**: Both handlers check `context.locals.user` independently of middleware:

- PUT: `src/pages/api/portfolios/[id].ts:10–15` — returns 401 if no user
- DELETE: `src/pages/api/portfolios/[id].ts:81–86` — returns 401 if no user

**Ownership enforcement**: No explicit `user_id` filter in queries — relies entirely on RLS.
The RLS policy `"Users can update own portfolios"` / `"Users can delete own portfolios"` filters
by `auth.uid() = user_id` at the DB level. The PUT handler's comment (line 51) acknowledges this.
Exception: DELETE's transaction-presence check (line 104–108) explicitly adds
`.eq("user_id", context.locals.user.id)` when checking whether the portfolio has transactions
before deletion — this is a business-logic guard, not a security guard.

**Path parameter validation**: UUID regex at lines 7, 18–23, 89–94 (not Zod). Returns 400 on
invalid ID.

**Supabase client**: Creates an anon-key `createServerClient` via
`createClient(context.request.headers, context.cookies)` — the user's JWT is injected from
cookies, so the client's DB calls run under that user's RLS context.

### 2. The index endpoint: `/api/portfolios/index.ts`

**HTTP methods exported**: `GET` (lines 8–42) and `POST` (lines 44–104). GET just selects all
portfolios; RLS filters to the calling user's rows automatically. POST inserts with
`user_id: context.locals.user.id` (line 80).

**No `GET /api/portfolios/[id]`**: The [id] route has no GET handler. Cross-user read at the
HTTP layer means "GET /api/portfolios returns User B's rows" — which RLS prevents and is already
proven at the Supabase-client layer.

### 3. Middleware (`src/middleware.ts:4–6`)

```typescript
const PROTECTED_ROUTES = ["/dashboard"];
const PROTECTED_API_ROUTES = ["/api/"];
const PUBLIC_API_ROUTES = ["/api/auth/"];
```

Line 26 uses `.startsWith(route)`, so `PROTECTED_API_ROUTES = ["/api/"]` covers every path
under `/api/` — including `/api/portfolios/some-uuid`. Any request to `/api/portfolios/[id]`
without a valid session already receives `{ error: "Unauthorized" }` with status 401.

The inline handler guards are therefore redundant-but-correct defence-in-depth.

### 4. RLS policies on `portfolios` (`supabase/migrations/20260613000000_create_portfolios.sql`)

| Operation | USING                  | WITH CHECK             | Status           |
| --------- | ---------------------- | ---------------------- | ---------------- |
| SELECT    | `auth.uid() = user_id` | N/A                    | ✓                |
| INSERT    | N/A                    | `auth.uid() = user_id` | ✓                |
| UPDATE    | `auth.uid() = user_id` | `auth.uid() = user_id` | ✓ (both clauses) |
| DELETE    | `auth.uid() = user_id` | N/A                    | ✓                |

RLS enabled: line 11 (`ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY`).
Foreign key: `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` (line 4).
**No WITH-CHECK gap** — all policies are correct (contrast: `prices` table once had a missing
WITH CHECK, fixed in migration `20260609000001`; portfolios never had this issue).

Two subsequent migrations bear on portfolios:

- `supabase/migrations/20260615000000_grant_table_permissions.sql:14–15` — grants
  SELECT/INSERT/UPDATE/DELETE to `authenticated` and `service_role`; SELECT to `anon`.
- `supabase/migrations/20260617000000_revoke_anon_grants_user_data.sql:12–13` — revokes
  anon SELECT on portfolios (defence-in-depth if RLS is accidentally disabled).

### 5. Existing test coverage

| Scenario                                            | Test file                                       | Coverage         | Verdict   |
| --------------------------------------------------- | ----------------------------------------------- | ---------------- | --------- |
| Unauthenticated GET/POST `/api/portfolios`          | `unauthenticated-api.integration.test.ts:13–40` | Middleware layer | ✓ covered |
| Unauthenticated PUT/DELETE `/api/portfolios/<uuid>` | —                                               | —                | **GAP**   |
| Cross-user read on portfolios (Supabase client)     | `rls-cross-user.integration.test.ts:37–56`      | DB layer         | ✓ covered |
| IDOR UPDATE on portfolios (Supabase client)         | `idor-write.integration.test.ts:66–84`          | DB layer         | ✓ covered |
| IDOR DELETE on portfolios                           | —                                               | —                | **GAP**   |

**Detail on unauthenticated-api test**: The existing test has a describe block titled
"PROTECTED_API_ROUTES catch-all: no valid session → 401" and exercises
`makeContext("GET", "/api/portfolios", ...)` and `makeContext("GET", "/api/transactions", ...)`.
It proves the catch-all works for the index path. It does NOT exercise PUT or DELETE on a
specific-ID path. While the middleware clearly covers these (same `startsWith` match), the test
does not explicitly verify it.

**Detail on idor-write portfolios**: `idor-write.integration.test.ts:66–84` tests User A
attempting to UPDATE User B's portfolio via the Supabase client and confirms 0 rows affected +
oracle re-fetch. It does **not** test DELETE.

### 6. Fixture sufficiency

`buildFixture()` in `src/test/integration/helpers/users.ts` already:

- Creates two auth users, signs them in with anon-key clients
- Seeds one portfolio per user (lines 86–98): `{ name: "Portfolio A/B", user_id: userId }`
- Exposes `fixture.userA.portfolioId` and `fixture.userB.portfolioId`
- Teardown cascades via `auth.admin.deleteUser()` → `ON DELETE CASCADE`

**No fixture changes needed** for either gap. The DELETE IDOR oracle can use:

```typescript
const { data } = await fixture.userB.client.from("portfolios").select().eq("id", fixture.userB.portfolioId);
expect(data).toHaveLength(1); // still exists
```

`portfolioSeed` is not needed because portfolio has only `name` and the test just needs to
assert existence (non-deletion), not field-for-field value comparison.

---

## Code References

- `src/pages/api/portfolios/[id].ts:9–78` — PUT handler (auth guard at lines 10–15)
- `src/pages/api/portfolios/[id].ts:80–160` — DELETE handler (auth guard at lines 81–86)
- `src/pages/api/portfolios/index.ts:8–42` — GET handler
- `src/middleware.ts:4–6` — route arrays; line 26 uses `startsWith`
- `supabase/migrations/20260613000000_create_portfolios.sql` — table schema + RLS policies
- `src/test/integration/unauthenticated-api.integration.test.ts:13–40` — existing auth-guard test (index paths only)
- `src/test/integration/idor-write.integration.test.ts:66–84` — existing portfolio UPDATE IDOR test
- `src/test/integration/rls-cross-user.integration.test.ts:37–56` — existing cross-user read test
- `src/test/integration/helpers/users.ts:86–98` — portfolio seeding in fixture
- `src/test/integration/helpers/middleware-context.ts` — `makeContext(method, pathname, cookieHeader?)` helper

---

## Architecture Insights

**Defence-in-depth stack**: For `/api/portfolios/[id]`:

1. Middleware catch-all (`PROTECTED_API_ROUTES = ["/api/"]`, `startsWith`) → 401 if no session
2. Handler inline check (`context.locals.user`) → redundant 401
3. Supabase anon-key client with user JWT → all DB calls run under RLS context
4. RLS UPDATE/DELETE policies (`auth.uid() = user_id`) → DB rejects cross-user mutations

**RLS-only ownership model**: Neither handler does an application-level `user_id` equality
check on the target row. This is intentional — it's the same pattern as `index.ts` and
`transactions/[id].ts`. The test plan cookbook §6.4 approves of this: "Prove at the
Supabase-client layer using the two-user fixture."

**No `portfolioSeed` oracle field needed**: Unlike `transactionSeed`, portfolios only have
`name` as a meaningful mutable field. For DELETE IDOR tests, proving the row still exists
(non-null re-fetch) is the sufficient oracle — no field-for-field comparison required.

---

## Historical Context

- `context/archive/2026-06-14-testing-api-security-integration/research.md:141–152` — confirmed
  no WITH CHECK gap on transactions or portfolios; prices was the only table with the bug.
- `context/archive/2026-06-14-testing-api-security-integration/plan.md:71–76` — established
  that only the anon-key client (never service-role) is used in assertions; still holds.
- `context/archive/2026-06-14-testing-api-security-integration/plan.md:139–141` — IDOR oracle
  rule: "re-fetch User B's row with User B's client after User A's write attempt; do not infer
  success from the write call's return shape alone."
- `context/archive/2026-06-14-testing-api-security-integration/research.md:200–213` — RLS makes
  a foreign row invisible (PGRST116), mapping to HTTP 404 not 403.
- `context/archive/2026-06-14-testing-api-security-integration/plan.md:98–102` — virtual module
  stub `src/test/stubs/astro-middleware.ts` was added to allow `onRequest` import in Node env.
  Already in place; no change needed.

---

## Open Questions

1. **Extend existing files vs. new file**: The two gaps live in `unauthenticated-api` and
   `idor-write` concerns. The plan must decide whether to extend those two existing files (keeps
   related tests co-located by concern) or create a single new
   `portfolios-api.integration.test.ts` (keeps new-endpoint tests together). Both are
   defensible; the plan should pick one.

2. **DELETE business-logic test scope**: `DELETE /api/portfolios/[id]` returns 409 when the
   portfolio has transactions (`src/pages/api/portfolios/[id].ts:104–120`). This is not a
   security risk — it is out of scope for this change. Note it in the plan if needed to set
   boundaries.

3. **Auth guard via HTTP layer vs. middleware layer**: The existing unauthenticated-API tests
   invoke `onRequest` directly (no running server). This is the established pattern and
   sufficient. No test-server setup is needed for the new auth-guard tests.
