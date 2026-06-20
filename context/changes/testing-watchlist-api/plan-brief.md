# Watchlist API — Auth-Guard Test — Plan Brief

> Full plan: `context/changes/testing-watchlist-api/plan.md`
> Research: `context/changes/testing-watchlist-api/research.md`

## What & Why

Prove that the middleware rejects unauthenticated requests to `GET /api/watchlist/quotes` (test-plan Risk #3). The route-level 401 is unit-tested with a mock, but no test proves the `/api/` middleware catch-all actually fires for this path — that's the one real coverage gap for this endpoint.

## Starting Point

The endpoint is a single read-only handler with a double auth guard (middleware + route-level). A thorough mocked unit test (`quotes.test.ts`) already covers the 200 shape, 400 validation, normalization, partial-failure, name fallback, and 500. The Risk #3 middleware suite (`unauthenticated-api.integration.test.ts`) covers `/api/portfolios` and `/api/transactions` but not the watchlist route.

## Desired End State

The existing Risk #3 integration suite asserts that unauthenticated `GET /api/watchlist/quotes` (no Cookie and garbage Cookie) returns 401 with `next` not called. The test-plan §6.4 cookbook records the route as covered. No production code changes.

## Key Decisions Made

| Decision                  | Choice                                           | Why (1 sentence)                                                                             | Source   |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- | -------- |
| Integration happy-path    | Skip it                                          | Mocked unit test already proves the 200 shape; integration version is high-cost, low-signal. | Plan     |
| Auth-guard test location  | Extend `unauthenticated-api.integration.test.ts` | Single home for the Risk #3 middleware proof; matches §6.4 pattern.                          | Plan     |
| 400 input validation      | Leave as-is                                      | Already owned by the unit test at the cheapest layer.                                        | Plan     |
| Risks #2 / #4 (read/IDOR) | Not tested                                       | Structurally impossible — no user-owned data, no write path.                                 | Research |

## Scope

**In scope:**

- One `describe` block (2 cases: no-Cookie, garbage-Cookie) for the watchlist route in the existing Risk #3 file.
- A one-sentence §6.4 cookbook update marking the route covered.

**Out of scope:**

- Authenticated happy-path integration test, integration-layer 400 re-checks, any production code, new test files, cross-user/IDOR tests.

## Architecture / Approach

Reuse the existing `makeContext()` + `invoke()` pattern: build a synthetic Astro context with empty `locals` (unauthenticated), call `onRequest` directly (no server, no Supabase), and assert 401 + `next` not called. Mirrors the portfolios/transactions cases verbatim.

## Phases at a Glance

| Phase                              | What it delivers                   | Key risk                                                                      |
| ---------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| 1. Watchlist middleware auth-guard | Two 401 cases + §6.4 cookbook note | Vacuous assertion (catch-all passes anyway) — mitigated by load-bearing check |

**Prerequisites:** Local Supabase running (`supabase start`) for `npm run test:integration`, though these specific cases need no DB.
**Estimated effort:** ~1 short session, single phase.

## Open Risks & Assumptions

- Because `PROTECTED_API_ROUTES` is a `/api/` catch-all, the new case shares a mechanism with existing cases; its value is pinning Risk #3 to the route the plan flagged, not testing new middleware logic. Manual check confirms the assertion is load-bearing.

## Success Criteria (Summary)

- `npm run test:integration` passes with two new watchlist cases under the Risk #3 suite.
- Unauthenticated `GET /api/watchlist/quotes` provably returns 401, `next` not called.
- §6.4 cookbook lists the route as covered.
