# API security tests for /api/portfolios/[id] — Plan Brief

> Full plan: `context/changes/testing-portfolios-api-security/plan.md`
> Research: `context/changes/testing-portfolios-api-security/research.md`

## What & Why

Close two named security-test gaps for the `/api/portfolios/[id]` endpoint (PUT, DELETE): no test exercises the middleware auth-guard for the specific-ID path (Risk #3), and cross-user DELETE on portfolios is untested (Risk #4). Both are gaps in the _test suite_ — the underlying code (middleware catch-all + RLS) is already correct.

## Starting Point

`/api/portfolios/[id]` exports PUT and DELETE, guarded by the `PROTECTED_API_ROUTES = ["/api/"]` middleware catch-all and RLS (`auth.uid() = user_id`). The existing `unauthenticated-api.integration.test.ts` proves the catch-all only for index paths; `idor-write.integration.test.ts` covers portfolio UPDATE but not DELETE. The two-user fixture already exposes everything needed.

## Desired End State

The integration suite additionally proves: unauthenticated PUT/DELETE on `/api/portfolios/<uuid>` → 401, and a cross-user portfolio DELETE affects 0 rows with the row left intact. The cookbook §6.4 records the new coverage.

## Key Decisions Made

| Decision                    | Choice                                          | Why                                                                        | Source   |
| --------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- | -------- |
| Test file organization      | Extend the two existing files                   | Both already hold portfolio cases; co-locates by concern per cookbook §6.2 | Plan     |
| Unauthenticated scope       | Both PUT and DELETE, no-cookie + garbage-cookie | Mirrors existing (a)/(b)/(c) thoroughness; proves both methods on `[id]`   | Plan     |
| DELETE business-logic (409) | Out of scope                                    | Business logic, not a security risk                                        | Research |
| IDOR DELETE oracle          | Re-fetch `name`, assert `"Portfolio B"`         | Portfolio has only `name`; existence proof is sufficient                   | Research |

## Scope

**In scope:**

- Unauthenticated PUT/DELETE guard cases for `/api/portfolios/<uuid>`
- Cross-user DELETE IDOR case on portfolios
- Cookbook §6.4 coverage-note update

**Out of scope:**

- DELETE 409-on-transactions business logic
- GET on `[id]` (no handler exists)
- Fixture / helper / production / migration changes
- Cross-user read and IDOR UPDATE (already covered)

## Architecture / Approach

Two structural clones of adjacent existing cases. Phase 1 adds PUT/DELETE cases to the unauthenticated-API suite, invoking `onRequest` directly via `makeContext` (no server). Phase 2 adds a portfolio DELETE case to the IDOR suite using the existing two-user fixture, with a User-B re-fetch oracle, then updates the test-plan cookbook.

## Phases at a Glance

| Phase                               | What it delivers                                  | Key risk                                     |
| ----------------------------------- | ------------------------------------------------- | -------------------------------------------- |
| 1. Unauthenticated guard (Risk #3)  | PUT/DELETE no-cookie + garbage-cookie → 401 cases | None material — clones existing pattern      |
| 2. IDOR DELETE + cookbook (Risk #4) | Cross-user portfolio DELETE case + §6.4 note      | Oracle must use re-fetch, not write response |

**Prerequisites:** Local Supabase running (`supabase start`) for the integration suite.
**Estimated effort:** ~1 session, two small file edits + a doc edit.

## Open Risks & Assumptions

- Assumes the two-user fixture's `userB.portfolioId` and seeded name `"Portfolio B"` remain stable (confirmed in `helpers/users.ts:86–98`).
- Assumes the typecheck script name; the plan defers to the project's actual script.

## Success Criteria (Summary)

- `npm run test:integration` green including the new cases.
- Unauthenticated PUT/DELETE on `[id]` rejected; cross-user DELETE leaves User B's portfolio intact.
- Cookbook §6.4 reflects the new coverage.
