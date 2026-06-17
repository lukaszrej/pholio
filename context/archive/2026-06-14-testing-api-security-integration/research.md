---
date: 2026-06-14T16:13:36Z
researcher: claude-sonnet-4-6
git_commit: dda600615bf794f4a14339015d56fda366a551d5
branch: main
repository: Pholio
topic: "API security integration tests — ground Risks #2, #3, #4"
tags: [research, security, rls, middleware, idor, api-routes, supabase]
status: complete
last_updated: 2026-06-14
last_updated_by: claude-sonnet-4-6
---

# Research: API Security Integration Tests — Risks #2, #3, #4

**Date**: 2026-06-14T16:13:36Z
**Researcher**: claude-sonnet-4-6
**Git Commit**: dda600615bf794f4a14339015d56fda366a551d5
**Branch**: main
**Repository**: Pholio

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md`. Verify the actual code posture for:

- Risk #2 — Cross-user read: does authenticated User A's session return User B's data?
- Risk #3 — Unauthenticated API access: do `/api/transactions` and `/api/portfolios` require a session?
- Risk #4 — IDOR on writes: does PATCH/DELETE with User B's resource ID succeed for User A?

For each risk, the research must: ground the real failure path in code with line references; verify or correct the response guidance from the test plan; and identify the cheapest test layer.

---

## Summary

**Risk #3 is the strongest.** Two independent auth guards (middleware + route-level) protect every
non-auth API route. Middleware uses `getUser()` (server-verified JWT), not `getSession()` (cookie-trusted).
The double-guard architecture means the test is straightforward: send a bare HTTP request, expect 401.

**Risk #2 is real but the RLS policies are correct.** All four operations on `transactions` and
`portfolios` have complete RLS policies (SELECT/INSERT/UPDATE/DELETE with correct `auth.uid() = user_id`
checks, and UPDATE has both `USING` and `WITH CHECK`). The API uses the anon key + user JWT — no
service role key exists anywhere in the project. What remains unproven is the _runtime_ behaviour:
that an authenticated User A's JWT actually scopes queries to only User A's rows. That is the test's
job to prove.

**Risk #4 relies entirely on RLS for mutations.** Every PUT/DELETE handler issues `.eq("id", id)`
only — no `.eq("user_id", user.id)` in the application layer. This is a deliberate, commented
architectural decision. The RLS policies for `transactions` are correct (USING + WITH CHECK both
present). An IDOR attempt will return 404 (RLS makes the row invisible → 0 rows → PGRST116 → 404),
not 403. The test must assert: row unchanged AND 404 returned.

**One gap discovered:** No GET `/api/transactions` endpoint exists — see Open Questions.

---

## Detailed Findings

### Risk #3 — Unauthenticated request to `/api/` routes

#### Middleware — `src/middleware.ts`

Two separate route lists control protection:

```
Line 4:  const PROTECTED_ROUTES = ["/dashboard"];          // page routes → redirect to signin
Line 5:  const PROTECTED_API_ROUTES = ["/api/"];           // API routes → 401 JSON
Line 6:  const PUBLIC_API_ROUTES = ["/api/auth/"];         // whitelisted: signin/signup/callback
```

Logic (lines 25–31): any request whose pathname starts with an entry in `PROTECTED_API_ROUTES`
**and** does not start with an entry in `PUBLIC_API_ROUTES` **and** has no authenticated user gets:

```json
{ "error": "Unauthorized" } // HTTP 401, Content-Type: application/json
```

This fires **before** the route handler runs.

The auth check at line 16 is `supabase.auth.getUser()` — this contacts Supabase's Auth server to
verify the JWT signature, unlike `getSession()` which trusts the cookie without server-side
validation. This is the correct call for a server-side middleware.

#### Route-level redundant guards

Every transaction and portfolio handler has an independent auth check that fires even if middleware
is bypassed:

| File                                  | Guard line                   | Before `createClient()`? |
| ------------------------------------- | ---------------------------- | ------------------------ |
| `src/pages/api/portfolios/index.ts`   | GET line 9, POST line 45     | Yes                      |
| `src/pages/api/portfolios/[id].ts`    | PUT line 10, DELETE line 81  | Yes                      |
| `src/pages/api/transactions/index.ts` | POST line 9                  | Yes                      |
| `src/pages/api/transactions/[id].ts`  | PUT line 10, DELETE line 102 | Yes                      |

All guards read `context.locals.user` (set by middleware) — they are not re-calling `getUser()`,
they are reading the already-validated result.

**Challenge from test plan resolved:** "Middleware protects `/dashboard`" ≠ "`/api/` routes are
also guarded" — **CONFIRMED: `/api/` routes ARE guarded.** `PROTECTED_API_ROUTES = ["/api/"]`
is a startsWith catch-all. Page-level and API-level protection are separate and both wired.

**Cheapest test layer (confirmed):** HTTP integration — send a `fetch()` with no `Cookie` header to
`GET /api/portfolios` and `POST /api/transactions`. Expect HTTP 401 with `{"error":"Unauthorized"}`.
No Supabase user or DB state needed.

---

### Risk #2 — Cross-user read (data scope)

#### Supabase client — anon key only, no service role

The project uses a single shared Supabase client factory (`src/lib/supabase.ts`) built with
`@supabase/ssr`'s `createServerClient`:

```typescript
createServerClient(SUPABASE_URL, SUPABASE_KEY, {
  /* cookie adapter */
});
```

`SUPABASE_KEY` is the **anon/public key**. There is no `SUPABASE_SERVICE_ROLE_KEY` — the
environment schema, `.env` file, and all source files contain no reference to a service role key.
This means every Supabase query runs with the authenticated user's JWT; RLS is always enforced.

#### RLS policies — `transactions` table

Migration: `supabase/migrations/20260604111725_create_transactions.sql`

| Operation | Policy name                         | Clause                                                               | Both USING + WITH CHECK?          |
| --------- | ----------------------------------- | -------------------------------------------------------------------- | --------------------------------- |
| SELECT    | "Users can select own transactions" | `USING (auth.uid() = user_id)`                                       | n/a (SELECT only uses USING)      |
| INSERT    | "Users can insert own transactions" | `WITH CHECK (auth.uid() = user_id)`                                  | n/a (INSERT only uses WITH CHECK) |
| UPDATE    | "Users can update own transactions" | `USING (auth.uid() = user_id)` + `WITH CHECK (auth.uid() = user_id)` | **YES** ✓                         |
| DELETE    | "Users can delete own transactions" | `USING (auth.uid() = user_id)`                                       | n/a                               |

#### RLS policies — `portfolios` table

Migration: `supabase/migrations/20260613000000_create_portfolios.sql`

| Operation | Policy name                       | Clause                                                               | Both USING + WITH CHECK? |
| --------- | --------------------------------- | -------------------------------------------------------------------- | ------------------------ |
| SELECT    | "Users can select own portfolios" | `USING (auth.uid() = user_id)`                                       | n/a                      |
| INSERT    | "Users can insert own portfolios" | `WITH CHECK (auth.uid() = user_id)`                                  | n/a                      |
| UPDATE    | "Users can update own portfolios" | `USING (auth.uid() = user_id)` + `WITH CHECK (auth.uid() = user_id)` | **YES** ✓                |
| DELETE    | "Users can delete own portfolios" | `USING (auth.uid() = user_id)`                                       | n/a                      |

**Challenge from test plan resolved:** "RLS is enabled ≠ all policies complete (USING + WITH CHECK
on every operation)" — **CONFIRMED: all policies complete.** The L3 lesson documented a real bug
in the `prices` table (UPDATE policy initially missing WITH CHECK, fixed in migration
`20260609000001`). That bug never existed in `transactions` or `portfolios`; their migrations had
both clauses from the start.

#### API read patterns (how queries are scoped)

`GET /api/portfolios/index.ts` (line ~30):

```typescript
const { data, error } = await supabase.from("portfolios").select("*");
```

No explicit `.eq("user_id", user.id)` filter. The query is correct only because RLS provides the
`WHERE user_id = auth.uid()` condition automatically. **If RLS were accidentally disabled, this
query would return all portfolios from all users.** The test must prove the runtime scoping is
active — that User A's session returns zero rows from User B, not an error.

**Cheapest test layer (confirmed):** Integration — two real Supabase users with real session tokens,
query portfolios with User A's token, assert zero rows from User B. Requires a real Supabase
instance (local or dedicated test project).

---

### Risk #4 — IDOR on transaction writes

#### Application-layer ownership check: absent for mutations

All four mutating handlers issue their final DB operation with only an `id` filter:

```typescript
// src/pages/api/transactions/[id].ts (PUT, line ~74)
.update(result.data).eq("id", id)

// src/pages/api/transactions/[id].ts (DELETE, line ~127)
.delete().eq("id", id)

// src/pages/api/portfolios/[id].ts (PUT, line ~52)
.update({ name }).eq("id", id)

// src/pages/api/portfolios/[id].ts (DELETE, line ~127)
.delete().eq("id", id)
```

Each has a code comment acknowledging that RLS (`auth.uid() = user_id`) is the sole ownership
enforcement layer. No `.eq("user_id", user.id)` appears on any final mutation.

**Exception (partial):** The `DELETE /api/portfolios/[id]` pre-flight transaction count query
uses `.eq("user_id", user.id)` — but only to count child transactions before the delete. The
actual `.delete()` operation on the portfolio row itself still uses `.eq("id", id)` only.

#### Expected response for an IDOR attempt

When User A sends `DELETE /api/transactions/<User B's id>`:

1. Middleware: user IS authenticated → passes (it cannot distinguish whose ID it is)
2. Handler: `context.locals.user` is set → passes the auth guard
3. Supabase query: `.delete().eq("id", id)` — RLS adds `AND user_id = auth.uid()`, which does NOT
   match User B's row → 0 rows deleted
4. The handler receives 0 rows from `.single()` → PGRST116 error code → returns **404**

**This is a correction to the test plan's expected response.** The plan says "404 or 403". The
correct expected response is **404** — not 403. Supabase RLS makes the row invisible (it is as if
it does not exist), not forbidden. The test oracle must assert 404, not 403, and independently
verify that User B's row is unchanged.

**Challenge from test plan resolved:** "RLS UPDATE is enabled ≠ policy has USING + WITH CHECK" —
**CONFIRMED: both clauses present for transactions.** The historical concern (L3 lesson, prices
table) was real but does not apply to `transactions` or `portfolios`, which had both clauses from
the start.

**Cheapest test layer (confirmed):** Integration — same two Supabase users as Risk #2. User B
creates a transaction; User A sends DELETE with User B's transaction ID; assert 404; re-fetch User
B's transaction to confirm it still exists.

---

### Architecture finding: inconsistent ownership model

Two different ownership-enforcement strategies exist side by side:

| Path                                           | Mechanism                                        | Defense-in-depth                                                                  |
| ---------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `transactions` SELECT/UPDATE/DELETE            | RLS only (`auth.uid() = user_id`)                | Single layer                                                                      |
| `transactions` INSERT                          | RLS + explicit `user_id: user.id` in INSERT body | Two layers                                                                        |
| `portfolios` SELECT/UPDATE/DELETE              | RLS only                                         | Single layer                                                                      |
| `portfolios` INSERT                            | RLS + explicit `user_id: user.id` in INSERT body | Two layers                                                                        |
| portfolio_id ownership in transaction POST/PUT | App-layer `maybeSingle()` lookup (RLS-scoped)    | Single layer (but correct: a foreign portfolio_id is invisible to the user's JWT) |

The impl review for `2026-06-10-transaction-crud` documented this explicitly (F1): "If RLS is ever
accidentally disabled, PUT/DELETE become IDOR vectors." The accepted mitigating factor is that RLS
is always enforced by the database engine and cannot be disabled per-query from the anon key.

---

### Existing test infrastructure

#### What exists

| File                        | Tests | Coverage                                                       |
| --------------------------- | ----- | -------------------------------------------------------------- |
| `src/lib/portfolio.test.ts` | 13    | Pure computation (computePositions, computePortfolioSummary)   |
| `src/lib/finnhub.test.ts`   | 6     | fetchQuote edge cases (c===0 guard, missing key, fetch errors) |

No API route tests. No auth/session tests. No integration test infrastructure for multi-user
scenarios.

#### What is configured but unused for integration tests

- `supabase/config.toml` — local Supabase instance configured; `supabase start` should work
- `vitest.config.ts` — Node environment, no Workers pool, no Supabase client stub
- `src/test/stubs/astro-env-server.ts` — exports `FINNHUB_API_KEY`; no Supabase stubs present

#### Integration test environment decision (open — see Open Questions)

The middleware runs in the Cloudflare Workers runtime. Testing it with `@cloudflare/vitest-pool-workers`
would test the exact runtime. An alternative is to test against a running dev server (`wrangler dev`
or `astro dev`) using `undici` or `fetch` — simpler to set up but adds process-management complexity.
Research cannot resolve this choice; it requires a planning decision on acceptable test complexity.

---

## Code References

- `src/middleware.ts:4-6` — PROTECTED_ROUTES, PROTECTED_API_ROUTES, PUBLIC_API_ROUTES constants
- `src/middleware.ts:16` — `supabase.auth.getUser()` (server-verified)
- `src/middleware.ts:25-31` — API route 401 rejection logic
- `src/pages/api/portfolios/index.ts:9,45` — route-level auth guards (GET, POST)
- `src/pages/api/portfolios/[id].ts:10,81` — route-level auth guards (PUT, DELETE)
- `src/pages/api/transactions/index.ts:9` — route-level auth guard (POST)
- `src/pages/api/transactions/[id].ts:10,102` — route-level auth guards (PUT, DELETE)
- `src/pages/api/transactions/[id].ts:74` — `.update(result.data).eq("id", id)` — RLS-only ownership
- `src/pages/api/transactions/[id].ts:127` — `.delete().eq("id", id)` — RLS-only ownership
- `src/pages/api/portfolios/[id].ts:52` — `.update({ name }).eq("id", id)` — RLS-only ownership
- `supabase/migrations/20260604111725_create_transactions.sql:15-33` — transactions RLS (all 4 operations)
- `supabase/migrations/20260613000000_create_portfolios.sql:11-29` — portfolios RLS (all 4 operations)
- `supabase/migrations/20260609000000_create_prices.sql:20-23` — original prices UPDATE (missing WITH CHECK)
- `supabase/migrations/20260609000001_fix_prices_update_policy.sql:3-6` — prices UPDATE fix (WITH CHECK added)

---

## Architecture Insights

**The security model is RLS-first, not defense-in-depth for mutations.** INSERTs set `user_id`
explicitly (two layers), but UPDATEs and DELETEs rely on RLS alone. This is a valid and common
Supabase pattern, but it creates a single point of failure: if RLS were accidentally disabled
(e.g., via a bad migration that runs `ALTER TABLE transactions DISABLE ROW LEVEL SECURITY`), all
user data becomes readable and writable by any authenticated user.

**The middleware `getUser()` choice matters.** Using `getUser()` instead of `getSession()` means
the middleware validates the JWT with Supabase's Auth server on every request. This is slower but
prevents replay attacks with expired or revoked tokens. The integration test for Risk #3 should
test both no-cookie AND a request with a syntactically valid but expired/revoked JWT (to confirm
`getUser()` rejects it).

**`PROTECTED_API_ROUTES = ["/api/"]` is a catch-all, not a list.** New API routes added under
`/api/` are automatically protected without any code change. This is a good default, but it also
means a developer could accidentally break it by adding `/api/` to `PUBLIC_API_ROUTES`. The test
for Risk #3 acts as a regression guard for this invariant.

---

## Historical Context

- `context/archive/2026-06-03-transactions-schema/plan.md` — RLS established here; all four
  operations correct from day one
- `context/archive/2026-06-04-auth-flow-complete/plan.md` — middleware ordering decided;
  `getUser()` chosen over `getSession()`
- `context/archive/2026-06-06-add-transaction/plan.md` — manual curl verification of cross-user
  blocking documented; portfolio ownership pre-check pattern established
- `context/archive/2026-06-10-transaction-crud/plan.md` — RLS-only ownership explicitly accepted;
  IDOR risk documented as F1 in impl review
- `context/archive/2026-06-13-dual-portfolio-view/reviews/impl-review.md` — F5: portfolio_id
  ownership at app layer accepted as sufficient; F1/F2/F3: error handling hardening

---

## Test Plan Response Guidance — Corrections and Confirmations

| Risk | Test plan challenge                                           | Research verdict                                                                                                               |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| #2   | "RLS is enabled ≠ all policies complete (USING + WITH CHECK)" | **Confirmed complete.** Both tables have all 4 operations and UPDATE has both clauses. Test still proves runtime scoping.      |
| #3   | "Middleware protects /dashboard ≠ /api/ routes guarded"       | **Confirmed guarded.** PROTECTED_API_ROUTES catch-all + route-level redundant guard. Test confirms the invariant.              |
| #4   | "RLS UPDATE is enabled ≠ USING + WITH CHECK present"          | **Confirmed both present** for transactions and portfolios. Prices bug was real (fixed); never affected these tables.          |
| #4   | Expected response: "404 or 403"                               | **Correction: 404 only.** RLS makes the row invisible (not forbidden). Response is 404 via PGRST116. Test oracle must use 404. |

---

## Open Questions

1. **No GET `/api/transactions` endpoint found.** Sub-agent found only POST at `transactions/index.ts`
   and PUT/DELETE at `transactions/[id].ts`. If transactions are read exclusively through dashboard
   UI components (server-side rendering, not a REST endpoint), then Risk #2's "User A retrieves
   User B's transactions" must be tested at the Supabase client level (direct DB query with User
   A's JWT), not via an HTTP API call. The plan must clarify which surface to test. Options:
   a. Test `supabase.from("transactions").select("*")` directly with User A's JWT → expect 0 rows from User B
   b. Test via the dashboard's server-rendered page (more complex, requires browser or SSR request)

2. **Integration test runner for API routes:** The middleware runs in the Cloudflare Workers runtime.
   Two options for HTTP-level tests:
   a. `@cloudflare/vitest-pool-workers` — runs tests inside Miniflare, exact runtime, but requires
   `wrangler.jsonc` bindings setup and more config
   b. Start `wrangler dev` or `astro dev` in a test helper and send real HTTP requests with `undici`
   — simpler test code, but adds process lifecycle management

3. **Supabase test environment:** For two-user RLS tests, two options:
   a. `supabase start` (local instance, `supabase/config.toml` already configured) + create two
   test users via `supabase.auth.signUp()` in `beforeAll`
   b. A dedicated Supabase test project (separate URL/keys) — avoids polluting local state but
   requires secrets in CI

4. **Revoked JWT test for Risk #3:** Should the unauthenticated test include a request with a
   syntactically valid but expired JWT? This would confirm `getUser()` (not `getSession()`) is
   actually enforcing server-side validation.
