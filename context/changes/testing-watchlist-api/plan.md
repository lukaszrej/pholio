# Watchlist API — Auth-Guard Test Implementation Plan

## Overview

Close the single real test-coverage gap for the watchlist endpoint: prove that the **middleware** rejects unauthenticated requests to `GET /api/watchlist/quotes` (test-plan Risk #3). Today the route-level guard is unit-tested with a mocked context, but no test proves the `/api/` middleware catch-all actually fires for this specific path. This change adds that middleware-layer assertion to the existing Risk #3 integration suite and records the coverage in the test-plan cookbook (§6.4).

Everything else the research surfaced is already covered or deliberately out of scope: the 200 response shape, uppercase normalization, partial-failure tolerance, name fallback, the three 400 input-validation cases, and the 500 path are all proven by the existing mocked unit test `src/pages/api/watchlist/quotes.test.ts`. Risks #2 (cross-user read) and #4 (IDOR write) are structurally impossible for this endpoint — it has no user-owned data and no write path.

## Current State Analysis

- **Endpoint** (`src/pages/api/watchlist/quotes.ts`): a single read-only `GET` handler. It double-guards auth (route-level `if (!context.locals.user)` → 401 at lines 16–21), parses a `?tickers=` CSV param, and read-through-caches `prices` + `sectors` (global, no `user_id`). No DB table, no writes.
- **Middleware** (`src/middleware.ts:4-6`): `PROTECTED_API_ROUTES = ["/api/"]` is a catch-all; `PUBLIC_API_ROUTES = ["/api/auth/"]` is the only exemption. `/api/watchlist/quotes` therefore matches the protected catch-all and should 401 without a session — but no test asserts this for the watchlist path specifically.
- **Existing unit test** (`src/pages/api/watchlist/quotes.test.ts`): fully mocked (`@/lib/supabase`, `@/lib/prices`, `@/lib/sectors`). Proves the handler's route-level 401, three 400 cases, 200 shape, uppercase normalization, partial-failure tolerance, name fallback, and 500. This is comprehensive **at the handler/mock layer** and stays untouched.
- **Existing middleware integration test** (`src/test/integration/unauthenticated-api.integration.test.ts`): proves the Risk #3 guard for `/api/portfolios` and `/api/transactions` via a synthetic context (`makeContext`) invoking `onRequest` directly — no running server. The watchlist route is absent from its cases.
- **Helper** (`src/test/integration/helpers/middleware-context.ts`): `makeContext(method, pathname, cookieHeader?)` builds the synthetic Astro context with empty `locals` (so no `user` → unauthenticated) and a `next` spy. Exactly the tool needed; no helper change required.

## Desired End State

`src/test/integration/unauthenticated-api.integration.test.ts` contains cases proving that `GET /api/watchlist/quotes`:

- with **no Cookie** → returns 401 `{ error: "Unauthorized" }`, and `next` is **not** called;
- with a **garbage Cookie** → returns 401, and `next` is **not** called.

The test-plan cookbook §6.4 records that the watchlist endpoint's auth guard is now covered by this suite. `npm run test:integration` passes (local Supabase running). No production code changes.

### Key Discoveries:

- Middleware test needs no server and no Supabase — `makeContext` + `onRequest` run in plain Node (`src/test/integration/unauthenticated-api.integration.test.ts:1-10`).
- The `invoke()` cast wrapper already exists in the target file (`unauthenticated-api.integration.test.ts:5-8`) — reuse it; do not redefine.
- `PROTECTED_API_ROUTES` is a `/api/` prefix catch-all (`src/middleware.ts:4`), so the watchlist case proves the same mechanism as the existing portfolios/transactions cases — but pins it to the route the test plan flagged.
- Empty `locals` in `makeContext` is what makes a request "unauthenticated"; the cookie value is irrelevant to the guard (a garbage cookie produces no valid session), which is why both no-Cookie and garbage-Cookie cases land on 401.

## What We're NOT Doing

- **Not** adding an authenticated happy-path integration test (decided: mocked unit test already proves the 200 shape; an integration version would require threading real JWT cookies into a synthetic context for thin, already-proven handler logic — high cost, low marginal signal).
- **Not** re-asserting the 400 input-validation cases at the integration layer (already owned by the unit test at the cheapest layer).
- **Not** touching `src/pages/api/watchlist/quotes.test.ts` or any production code.
- **Not** creating a new test file — the watchlist case extends the existing Risk #3 file.
- **Not** testing cross-user read (#2) or IDOR (#4) — structurally impossible for this endpoint.

## Implementation Approach

Append a new `describe` block (or extend the existing catch-all block) in `unauthenticated-api.integration.test.ts` for the watchlist route, mirroring the existing portfolios/transactions cases exactly: build a context with `makeContext("GET", "/api/watchlist/quotes", ...)`, `invoke`, then assert `next` not called and `response.status === 401`. Reuse the file's existing `invoke()` helper. Finish by updating the §6.4 cookbook note in `context/foundation/test-plan.md` so the next contributor knows this route is covered.

## Phase 1: Add middleware auth-guard case for `/api/watchlist/quotes`

### Overview

Extend the existing Risk #3 integration suite with the watchlist route and record the new coverage in the cookbook.

### Changes Required:

#### 1. Watchlist auth-guard cases

**File**: `src/test/integration/unauthenticated-api.integration.test.ts`

**Intent**: Prove the `/api/` middleware catch-all rejects unauthenticated `GET /api/watchlist/quotes`, pinning Risk #3 coverage to the route the test plan flagged. Mirrors the existing portfolios/transactions cases.

**Contract**: Add a `describe("/api/watchlist/quotes — no valid session → 401")` block (sibling of the existing catch-all block) with two `it` cases reusing the file's `invoke()` helper and `makeContext`:

- no Cookie → `expect(next).not.toHaveBeenCalled()`, `expect(response.status).toBe(401)`, body equals `{ error: "Unauthorized" }`;
- garbage Cookie (`"garbage-session=not-a-real-token"`) → `next` not called, status 401.
  No new imports or helpers; `makeContext` and `invoke` are already in scope.

#### 2. Cookbook coverage note

**File**: `context/foundation/test-plan.md`

**Intent**: Record that the watchlist endpoint's auth guard is now covered, so future contributors don't re-derive the gap.

**Contract**: In §6.4 ("Adding a test for a new API endpoint"), update the **Auth guard pattern** paragraph to list `/api/watchlist/quotes` among the routes whose middleware guard is proven in `unauthenticated-api.integration.test.ts`. One sentence; no structural change to the section.

### Success Criteria:

#### Automated Verification:

- Integration suite passes: `npm run test:integration`
- Lint passes: `npm run lint`
- Typecheck passes: `npm run typecheck` (or the project's configured type-check script)

#### Manual Verification:

- The new cases appear under the Risk #3 suite output and reference `/api/watchlist/quotes`.
- Temporarily removing `/api/watchlist/quotes` from protection (e.g. mentally tracing a `PUBLIC_API_ROUTES` change) would flip the new cases to failing — i.e. the assertion is load-bearing, not vacuous.

**Implementation Note**: After automated verification passes, pause for manual confirmation before considering the phase complete.

---

## Testing Strategy

### Integration Tests:

- Unauthenticated `GET /api/watchlist/quotes` → 401, `next` not called (no Cookie and garbage Cookie variants), via `onRequest` + `makeContext`. No server, no Supabase reads needed for these cases.

### Manual Testing Steps:

1. Run `npm run test:integration` with local Supabase up; confirm the two new watchlist cases pass.
2. Confirm existing portfolios/transactions Risk #3 cases and the unrelated suites still pass (no regression).

## References

- Research: `context/changes/testing-watchlist-api/research.md`
- Reference test (pattern to mirror): `src/test/integration/unauthenticated-api.integration.test.ts`
- Helper: `src/test/integration/helpers/middleware-context.ts:13`
- Endpoint under test: `src/pages/api/watchlist/quotes.ts:16`
- Middleware guard: `src/middleware.ts:4`
- Cookbook entry to update: `context/foundation/test-plan.md` §6.4

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Add middleware auth-guard case for `/api/watchlist/quotes`

#### Automated

- [x] 1.1 Integration suite passes: `npm run test:integration`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Typecheck passes: `npm run typecheck`

#### Manual

- [x] 1.4 New cases appear under the Risk #3 suite and reference `/api/watchlist/quotes`
- [x] 1.5 Assertion is load-bearing (would fail if the route were unprotected)
