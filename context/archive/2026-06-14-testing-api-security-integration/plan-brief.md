# API Security Integration Tests — Plan Brief

> Full plan: `context/changes/testing-api-security-integration/plan.md`
> Research: `context/changes/testing-api-security-integration/research.md`

## What & Why

Rollout Phase 2 of the test plan: prove that authenticated users can read and
write **only their own** data, and that unauthenticated callers are rejected.
The PRD treats cross-user data access as "absolutely inaccessible"; research
confirmed the code posture is correct but the **runtime** scoping is unproven —
these tests close that gap and stand as regression guards.

## Starting Point

Only unit tests exist (`src/lib/*.test.ts`), run by `npm test` with no Docker
dependency. RLS on `transactions` and `portfolios` is complete; the app uses
the anon key + user JWT only (no service-role key in app code). Middleware
double-guards `/api/` via a `PROTECTED_API_ROUTES` catch-all returning 401.
There is **no `GET /api/transactions` endpoint** and IDOR resolves to **404**,
not 403 (research corrections).

## Desired End State

`npm run test:integration` (against a local `supabase start`) authenticates two
users and proves: User A reads zero of User B's rows; User A's UPDATE/DELETE on
User B's transaction changes nothing; and `/api/` calls without a valid session
return 401. The existing `npm test` unit suite stays fast and Docker-free.

## Key Decisions Made

| Decision         | Choice                                             | Why                                                                                       | Source          |
| ---------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------- |
| Risk #3 runtime  | Invoke `onRequest` directly with synthetic context | Cheapest, all-Node; exact for the catch-all invariant that is the real regression surface | Plan            |
| Supabase env     | Local `supabase start`                             | Config already present, zero secrets, fast; CI provisioning deferred to Phase 4           | Plan            |
| #2/#4 test layer | Supabase-client DB layer (two JWTs)                | Proves RLS scoping directly; works despite missing transactions read endpoint             | Research + Plan |
| Risk #3 depth    | No-cookie + garbage token                          | Covers the realistic regression deterministically; expired-JWT case dropped as flaky      | Plan            |
| Data lifecycle   | `beforeAll` create / `afterAll` teardown           | Fast (one signup pair per file), deterministic, leaves instance clean                     | Plan            |
| CI wiring        | Deferred to Phase 4                                | Keeps phases single-purpose; avoids Supabase-in-CI leaking into a test-authoring phase    | Plan            |
| IDOR response    | Assert row unchanged (DB layer), not HTTP 404      | Load-bearing oracle is the unchanged victim row; handler 404 mapping left out by design   | Research        |

## Scope

**In scope:**

- Vitest `projects` split isolating integration tests from the unit suite
- Two-user local-Supabase fixture (provision via service-role, assert via anon+JWT)
- Risk #2 (cross-user read), #4 (IDOR write), #3 (unauthenticated 401) tests
- Cookbook §6.2 / §6.4 and the `test:integration` run command

**Out of scope:**

- CI / GitHub Actions wiring (Phase 4)
- Service-role key in application code; SSR/dashboard read path for #2
- Expired/revoked-JWT case; HTTP 404 assertion through the handler
- Any production code or schema change

## Architecture / Approach

One local Supabase instance feeds three test surfaces: a service-role client
provisions/tears down two users (fixture only); two anon-key clients carrying
each user's JWT drive the RLS/IDOR assertions; and `onRequest` is invoked with
a synthetic context for the 401 guard. A Vitest `projects` split keeps
`npm test` (unit) Docker-free while `npm run test:integration` runs the new
suite on demand.

## Phases at a Glance

| Phase                    | What it delivers                                                      | Key risk                                                            |
| ------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1. Integration harness   | Vitest projects split, `.env.test`, two-user fixture, smoke test      | Env separation between unit stub and real local values              |
| 2. RLS + IDOR tests      | Cross-user read = 0 rows; IDOR write leaves victim row unchanged      | Tests must use anon+JWT clients (not service-role) or prove nothing |
| 3. Unauthenticated guard | `onRequest` → 401 for no-cookie + garbage token; `/api/auth/*` exempt | Synthetic context must faithfully match what `onRequest` expects    |
| 4. Cookbook + docs       | §6.2/§6.4 filled; Phase 2 row marked complete                         | None — documentation only                                           |

**Prerequisites:** Local `supabase start` (Docker); `supabase` CLI (already a devDependency).
**Estimated effort:** ~1–2 sessions across 4 phases (Phase 1 carries most of the setup cost).

## Open Risks & Assumptions

- Assumes the local Supabase service-role + anon keys from `supabase status` are stable across contributors' machines (they are, for the default local stack).
- Email confirmation is bypassed via admin `createUser({ email_confirm: true })`; if local auth config changes, fixture setup may need adjustment.
- `npm test` must remain Docker-free — verified explicitly in Phase 1 (criterion 1.5).

## Success Criteria (Summary)

- User A provably reads zero of User B's transactions and portfolios.
- User A's write against User B's transaction changes nothing; victim row matches its seed.
- Unauthenticated `/api/` calls return 401; the unit suite still runs without Supabase.
