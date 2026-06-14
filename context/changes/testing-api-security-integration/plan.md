# API Security Integration Tests Implementation Plan

## Overview

Rollout Phase 2 of `context/foundation/test-plan.md`: prove that users can
read and write **only their own** data and that unauthenticated callers are
rejected. Three risks are covered (#2 cross-user read, #3 unauthenticated API
access, #4 IDOR on writes) with the cheapest faithful layer for each:

- **#2 and #4** are RLS/database behaviour — tested at the Supabase-client
  layer with two real user JWTs against a local `supabase start` instance.
- **#3** is middleware behaviour — tested by invoking `onRequest` directly
  with a synthetic Astro context; no running server, no build.

CI wiring is intentionally **deferred to rollout Phase 4** (test-plan §3).
This plan adds the tests, the harness, the npm script, and the cookbook
entries — not the GitHub Actions job.

## Current State Analysis

- **No integration test infrastructure exists.** `vitest.config.ts`
  (`vitest.config.ts:4-15`) is a single Node project with two aliases (`@` →
  `./src`, `astro:env/server` → `src/test/stubs/astro-env-server.ts`). Only
  unit suites exist: `src/lib/portfolio.test.ts`, `src/lib/finnhub.test.ts`.
- **`npm test` = `vitest run`** (`package.json:14`) runs every `*.test.ts`.
  Integration tests must NOT join this fast, Docker-free, CI-wired suite.
- **Security posture is verified (research.md).** Both `transactions` and
  `portfolios` have complete RLS on all four operations (UPDATE has both
  `USING` + `WITH CHECK`). The app uses the anon key + user JWT only — **no
  service-role key exists in application code** (`src/lib/supabase.ts:9`).
- **Middleware double-guards `/api/`** (`src/middleware.ts:5,26-32`):
  `PROTECTED_API_ROUTES = ["/api/"]` is a `startsWith` catch-all returning
  401 JSON before any handler runs; `PUBLIC_API_ROUTES = ["/api/auth/"]` is
  whitelisted. Auth check is `getUser()` (server-verified), not
  `getSession()`.
- **No `GET /api/transactions` endpoint exists** (research Open-Q1). Therefore
  the transactions cross-user read can only be proven at the Supabase-client
  layer — there is no HTTP read surface to drive.
- **IDOR returns 404, not 403** (research correction). RLS makes a foreign row
  invisible → 0 rows → PGRST116 → 404. The load-bearing assertion for #4 is
  "User B's row is unchanged"; the response code is secondary and, at the DB
  layer, surfaces as "0 rows affected".
- **Local Supabase is configured.** `supabase/config.toml`: API on
  `127.0.0.1:54321`, `enable_signup = true`, email auth on. `supabase` CLI is
  already a devDependency (`package.json:63`).

## Desired End State

Running `npm run test:integration` against a local `supabase start` instance:

1. Authenticates two distinct test users (User A, User B), each owning one
   seeded portfolio and one seeded transaction.
2. Proves User A's client reads **zero** of User B's transactions and
   portfolios (Risk #2).
3. Proves User A's `UPDATE`/`DELETE` against User B's transaction id affects
   **zero rows** and leaves User B's row unchanged (Risk #4).
4. Proves `onRequest` returns **401** for `/api/transactions` and
   `/api/portfolios` with no cookie and with a garbage token, and passes
   `/api/auth/*` through (Risk #3).

`npm test` (the existing unit suite) still runs with no Docker dependency and
does **not** pick up the integration files. `test-plan.md` §6.2 and §6.4 are
filled in.

### Key Discoveries:

- Risk #2/#4 don't need the Astro runtime — they are pure RLS assertions
  (`research.md` "Risk #2", "Risk #4").
- Risk #3's 401 path is effectively Supabase-independent (no/garbage token →
  no user → 401), but `onRequest` imports `createClient`, which imports
  `astro:env/server` — the integration config must provide real local env
  values, not the unit stub.
- The local **service-role key** (from `supabase status`) is the standard way
  to provision + auto-confirm test users without the email-confirmation loop.
  It is used ONLY for fixture setup/teardown — never in the assertions, which
  use anon-key clients scoped by each user's JWT (the thing under test).

## What We're NOT Doing

- **Not wiring CI / GitHub Actions** — that is rollout Phase 4 (test-plan §3).
- **Not adding a service-role key to application code** — fixture-only, in
  test files, sourced from the local instance.
- **Not testing Supabase auth internals** (signup/token exchange) — test-plan
  §7 exclusion; we use auth only to obtain JWTs.
- **Not testing the dashboard SSR read path** for Risk #2 — DB-layer proof was
  chosen over the browser/SSR surface (research Open-Q1 option a).
- **Not asserting the HTTP 404 mapping through the route handler** — the
  load-bearing IDOR assertion (row unchanged / 0 rows) is proven at the DB
  layer; handler-level 404 is left out by design.
- **Not changing any production code** — `src/`, `supabase/migrations/` are
  untouched except the `astro:env/server` stub additions used by tests.
- **Not adding an expired/revoked-JWT case** for Risk #3 (research Open-Q4
  option a): no-cookie + garbage token only.

## Implementation Approach

Two test layers, one local Supabase instance:

```
local `supabase start`  (127.0.0.1:54321)
        │
        ├── service-role client  ──►  fixture: create+confirm User A/B, seed rows, teardown
        │
        ├── anon client + User A JWT ─┐
        ├── anon client + User B JWT ─┴►  Risk #2 (read scope) + Risk #4 (IDOR write)
        │
        └── onRequest(synthetic ctx) ──►  Risk #3 (401 guard)  [reads local env, no user]
```

Integration tests are isolated from the unit suite via a Vitest **projects**
split so `npm test` stays fast and Docker-free.

## Critical Implementation Details

- **Env separation is load-bearing.** The unit project keeps aliasing
  `astro:env/server` to the existing stub. The integration project must
  resolve `SUPABASE_URL` / `SUPABASE_KEY` to the **real local** values (so
  `onRequest`'s `getUser()` resolves cleanly to "no user"). Do this by
  extending the stub to read `process.env` with local defaults, loaded by an
  integration setup file — not by hardcoding into the unit stub.
- **Service-role usage is fixture-only.** Provision/confirm/delete users with
  the local service-role key; every _assertion_ must use an anon-key client
  carrying a user JWT, or RLS is bypassed and the test proves nothing.
- **The negative assertion is the test.** "User A sees their own rows" is not
  sufficient; "User A sees 0 of User B's rows" is the load-bearing check
  (test-plan §2 Risk #2 anti-pattern).
- **Oracle for #4 is the unchanged row, not the API code.** Re-fetch User B's
  transaction with User B's client after User A's write attempt and compare
  field-by-field to the seeded value — do not infer success from the write
  call's return shape alone.

---

## Phase 1: Integration Test Harness

### Overview

Stand up a Supabase-backed integration layer isolated from the unit suite,
with a two-user fixture, and prove both users authenticate. No risk assertions
yet — just the scaffolding a smoke test exercises.

### Changes Required:

#### 1. Vitest projects split

**File**: `vitest.config.ts`

**Intent**: Separate the fast Docker-free unit suite from the
Supabase-dependent integration suite so `npm test` is unchanged and
integration files run only on demand.

**Contract**: Convert to a `projects`-based config (Vitest 4.1). Project
`unit`: current settings, include `src/**/*.test.ts`, **exclude**
`**/*.integration.test.ts`, keep both aliases (`@`, `astro:env/server` → unit
stub). Project `integration`: include `**/*.integration.test.ts`, Node
environment, a setup file (below), and alias `astro:env/server` → the same
stub module (which will read `process.env`). The default `vitest run` must
resolve to the `unit` project only — `npm test` continues to pass with no
Supabase running.

#### 2. Integration run script

**File**: `package.json`

**Intent**: Add a dedicated command for the integration suite; leave `test`
and `test:watch` untouched.

**Contract**: Add `"test:integration": "vitest run --project integration"`.
Do not alter `"test"` / `"test:watch"`.

#### 3. Local test env

**File**: `.env.test` (new), `.gitignore` (verify), `src/test/stubs/astro-env-server.ts`

**Intent**: Provide the integration project with the local Supabase URL and
anon key (both public-by-design) plus a fixture-only service-role key.

**Contract**: `.env.test` defines `SUPABASE_URL=http://127.0.0.1:54321`,
`SUPABASE_KEY=<local anon key>`, and `SUPABASE_SERVICE_ROLE_KEY=<local
service-role key>` (values from `supabase status`). The local anon key is
non-secret and may be committed; document obtaining it. Extend
`src/test/stubs/astro-env-server.ts` so its exported `SUPABASE_URL` /
`SUPABASE_KEY` read from `process.env` with the existing mutable-`let`
pattern, falling back to current behaviour when unset (so unit tests are
unaffected).

#### 4. Integration setup file

**File**: `src/test/integration/setup.ts` (new)

**Intent**: Load `.env.test` into `process.env` and fail fast with a clear
message if the local Supabase instance is unreachable.

**Contract**: Loads `.env.test`, then performs a reachability check against
`SUPABASE_URL` (e.g. a health/`/auth/v1/health` ping); on failure throws a
message naming the fix (`supabase start`). Registered as the `integration`
project's setup file.

#### 5. Two-user fixture helper

**File**: `src/test/integration/helpers/users.ts` (new)

**Intent**: Provide reusable creation, JWT acquisition, row seeding, and
teardown for User A and User B.

**Contract**: Export a helper that, given the service-role client, creates two
confirmed users (admin `createUser` with `email_confirm: true`), seeds one
portfolio + one transaction per user, and returns: each user's **anon-key**
client authenticated with that user's JWT, the seeded row ids, and a
`teardown()` that deletes both users and their rows. Service-role client is
used only here. Seeded transaction fields use hand-known values (for the #4
oracle).

#### 6. Smoke test

**File**: `src/test/integration/smoke.integration.test.ts` (new)

**Intent**: Prove the harness end-to-end: Supabase reachable, two users
authenticate, fixture seeds and tears down.

**Contract**: `beforeAll` builds the fixture; one test asserts both users have
distinct non-null `user.id`s and each can read their own seeded transaction;
`afterAll` runs teardown. May be removed once Phase 2 tests exist, or kept as
the canonical harness reference.

### Success Criteria:

#### Automated Verification:

- Unit suite unaffected and Docker-free: `npm test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Integration smoke passes against local Supabase: `npm run test:integration`
- `npm test` does NOT execute any `*.integration.test.ts` file (verify via run output)

#### Manual Verification:

- With `supabase start` not running, `npm run test:integration` fails with the clear "start Supabase" message (not an opaque network error)
- `.env.test` service-role key is present only in test config, not imported by any `src/` non-test module

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: RLS Data-Scope + IDOR Tests (Risks #2, #4)

### Overview

Using the two-user fixture, prove cross-user reads return zero rows and IDOR
writes change nothing. Pure Supabase-client layer.

### Changes Required:

#### 1. Cross-user read test (Risk #2)

**File**: `src/test/integration/rls-cross-user.integration.test.ts` (new)

**Intent**: Prove User A's authenticated client cannot read any of User B's
data, for both tables.

**Contract**: With User A's anon+JWT client: `from("transactions").select("*")`
returns only User A's rows and **zero** rows whose id is User B's seeded
transaction; same for `portfolios`. Positive control included (User A sees
own row) but the **negative** assertion (zero of User B's) is the required
check. A direct `.eq("id", <User B's id>)` lookup under User A's client must
return an empty set, not an error.

#### 2. IDOR write test (Risk #4)

**File**: `src/test/integration/idor-write.integration.test.ts` (new)

**Intent**: Prove User A cannot mutate User B's transaction, and User B's row
is untouched.

**Contract**: With User A's client, `update(...).eq("id", <User B's txn id>)`
and `delete().eq("id", <User B's txn id>)` each affect **0 rows** (empty
returned data / no error masking). After each attempt, re-fetch the row with
**User B's** client and assert it equals the seeded value field-for-field
(oracle = the hand-known seed, not the write response). Mirror for one
`portfolios` UPDATE to cover the second table.

### Success Criteria:

#### Automated Verification:

- Integration suite passes: `npm run test:integration`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Temporarily disabling RLS on `transactions` locally makes the #2/#4 tests fail (confirms the tests actually exercise RLS, not an incidental filter) — re-enable afterward
- The IDOR test's oracle is the seeded value, verified by reading the test source (no value derived from the write call)

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: Unauthenticated API Guard Test (Risk #3)

### Overview

Prove the middleware rejects unauthenticated `/api/` calls by invoking
`onRequest` directly with a synthetic context. No server, no build.

### Changes Required:

#### 1. Unauthenticated guard test

**File**: `src/test/integration/unauthenticated-api.integration.test.ts` (new)

**Intent**: Assert the `PROTECTED_API_ROUTES` catch-all returns 401 for
protected API paths without a valid session, and that `/api/auth/*` is exempt.

**Contract**: Import `onRequest` from `src/middleware.ts`. Build a minimal
synthetic Astro middleware context (a `Request` with the target pathname and
headers, an `AstroCookies`-shaped stub, `locals`, `url`, and a `next` spy).
Cases: (a) `GET /api/portfolios` no Cookie → `Response` status 401 with
`{"error":"Unauthorized"}`, `next` not called; (b) `POST /api/transactions`
no Cookie → 401; (c) `GET /api/portfolios` with a garbage `Cookie` token →
401; (d) a `/api/auth/...` path → `next` IS called (not 401). Runs in the
integration project so `onRequest`'s `getUser()` resolves against local
Supabase to "no user".

#### 2. Middleware context helper (if needed)

**File**: `src/test/integration/helpers/middleware-context.ts` (new, optional)

**Intent**: Factor out synthetic-context construction so the four cases stay
readable.

**Contract**: Export a builder returning a context object accepted by
`onRequest` plus the `next` spy. Only create if it reduces duplication;
otherwise inline.

### Success Criteria:

#### Automated Verification:

- Integration suite passes: `npm run test:integration`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Temporarily adding `/api/` to `PUBLIC_API_ROUTES` (or removing it from `PROTECTED_API_ROUTES`) makes case (a)/(b) fail — confirms the test guards the real invariant; revert afterward

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding.

---

## Phase 4: Cookbook + Run-Command Docs

### Overview

Fill the test-plan cookbook so future contributors can add integration and
API-endpoint tests without rediscovering the harness. Documentation only.

### Changes Required:

#### 1. Cookbook §6.2 — integration test pattern

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.2 `TBD` with the established pattern.

**Contract**: Document: file location (`src/test/integration/*.integration.test.ts`)
and naming; prerequisite (`supabase start`); the two-user fixture
(`helpers/users.ts`) and that assertions use anon+JWT clients while
provisioning uses the service-role key; the negative-assertion rule (zero
foreign rows); the run command (`npm run test:integration`); and reference
tests (`rls-cross-user`, `idor-write`).

#### 2. Cookbook §6.4 — new API endpoint test pattern

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.4 `TBD`.

**Contract**: Document: integration preferred over unit for API routes; the
auth guard is proven by invoking `onRequest` (reference
`unauthenticated-api.integration.test.ts`); ownership/IDOR proven at the
Supabase layer; record the **404-not-403** fact (RLS invisibility → PGRST116)
so it is not relitigated; note no `GET /api/transactions` endpoint exists.

#### 3. Status stamps

**File**: `context/foundation/test-plan.md`, `context/changes/testing-api-security-integration/change.md`

**Intent**: Reflect completion.

**Contract**: §3 Phase 2 row → `complete`; update the "Last updated" line.
`change.md` → `status: implemented` (or project convention), `updated:`
today.

### Success Criteria:

#### Automated Verification:

- Markdown lint/format passes if configured: `npm run lint`
- §6.2 and §6.4 no longer contain "TBD" (verify by reading the file)

#### Manual Verification:

- A reader unfamiliar with the work can follow §6.2 to add a new integration test and §6.4 to add an endpoint test without reading the plan
- §3 Phase 2 status reads `complete`

**Implementation Note**: Final phase — confirm the rollout orchestrator
(`/10x-test-plan`) advances to Phase 3 after this lands.

---

## Testing Strategy

### Integration Tests (this plan's product):

- Cross-user read returns zero foreign rows (transactions + portfolios)
- IDOR UPDATE/DELETE affects zero rows; victim row unchanged (oracle = seed)
- Unauthenticated `/api/` → 401 (no-cookie + garbage token); `/api/auth/*` exempt

### Manual Testing Steps:

1. `supabase start`, then `npm run test:integration` — all pass.
2. Stop Supabase, re-run — fails fast with the "start Supabase" message.
3. Disable RLS on `transactions` locally — #2/#4 fail; re-enable.
4. Add `/api/` to `PUBLIC_API_ROUTES` — Risk #3 cases fail; revert.
5. `npm test` — unit suite passes with Supabase stopped (no Docker dependency).

## Performance Considerations

Integration tests pay a one-time `beforeAll` cost (two signups + seeds per
file). Keep fixtures at file scope (`beforeAll`/`afterAll`), not per-test, to
avoid repeated auth round-trips. The suite is run on demand, not in the fast
inner loop.

## Migration Notes

None — additive test infrastructure only. No production code or schema
changes. `.env.test` introduces a local service-role key for fixtures; ensure
it is never imported by a non-test module.

## References

- Research: `context/changes/testing-api-security-integration/research.md`
- Test plan: `context/foundation/test-plan.md` (§2 Risks #2/#3/#4, §3 Phase 2, §6.2/§6.4)
- Middleware guard: `src/middleware.ts:5,26-32`
- Supabase client factory (anon-only): `src/lib/supabase.ts:9`
- RLS migrations: `supabase/migrations/20260604111725_create_transactions.sql`, `supabase/migrations/20260613000000_create_portfolios.sql`
- Lessons: `context/foundation/lessons.md` (RLS USING + WITH CHECK; double quotes; Zod v4)
- Unit reference pattern: `src/lib/finnhub.test.ts`, `src/lib/portfolio.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Integration Test Harness

#### Automated

- [x] 1.1 Unit suite unaffected and Docker-free: `npm test`
- [x] 1.2 Type checking passes: `npm run typecheck`
- [x] 1.3 Linting passes: `npm run lint`
- [x] 1.4 Integration smoke passes against local Supabase: `npm run test:integration`
- [x] 1.5 `npm test` does NOT execute any `*.integration.test.ts` file

#### Manual

- [x] 1.6 Supabase-down run fails with a clear "start Supabase" message
- [x] 1.7 Service-role key present only in test config, not imported by any `src/` non-test module

### Phase 2: RLS Data-Scope + IDOR Tests (Risks #2, #4)

#### Automated

- [ ] 2.1 Integration suite passes: `npm run test:integration`
- [ ] 2.2 Type checking passes: `npm run typecheck`
- [ ] 2.3 Linting passes: `npm run lint`

#### Manual

- [ ] 2.4 Disabling RLS on `transactions` locally makes #2/#4 fail; re-enabled
- [ ] 2.5 IDOR oracle is the seeded value (verified by reading test source)

### Phase 3: Unauthenticated API Guard Test (Risk #3)

#### Automated

- [ ] 3.1 Integration suite passes: `npm run test:integration`
- [ ] 3.2 Type checking passes: `npm run typecheck`
- [ ] 3.3 Linting passes: `npm run lint`

#### Manual

- [ ] 3.4 Making `/api/` public breaks cases (a)/(b); reverted

### Phase 4: Cookbook + Run-Command Docs

#### Automated

- [ ] 4.1 Markdown lint/format passes if configured: `npm run lint`
- [ ] 4.2 §6.2 and §6.4 no longer contain "TBD"

#### Manual

- [ ] 4.3 §6.2/§6.4 are followable by an unfamiliar reader
- [ ] 4.4 §3 Phase 2 status reads `complete`
