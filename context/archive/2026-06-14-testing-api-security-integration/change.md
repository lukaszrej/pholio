---
change_id: testing-api-security-integration
title: Phase 2 API security integration tests
status: archived
created: 2026-06-14
updated: 2026-06-17
archived_at: 2026-06-17T16:44:35Z
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "API security integration tests".
Risks covered: #2 (Cross-user read — User A retrieves User B's transactions or portfolio via RLS gap or service-role key misuse), #3 (Unauthenticated request to /api/transactions or /api/portfolios succeeds), #4 (IDOR on transaction write — User A sends PATCH/DELETE with User B's ID and the operation succeeds).
Test types planned: Integration (real Supabase, two test users).
Risk response intent:

- Risk #2: Prove User A's authenticated session querying /api/transactions or /api/portfolios/[id] returns zero rows from User B; the negative assertion (cross-tenant read returns zero rows, not an error) is the load-bearing check — not just the positive (User A sees their own data). Challenge: "RLS is enabled" ≠ "all policies have both USING and WITH CHECK on every operation."
- Risk #3: Prove GET/POST to /api/transactions or /api/portfolios without a session cookie returns 401 or 403, not data. Challenge: "Middleware protects /dashboard" ≠ "/api/ routes are also guarded" — they may need separate entries in PROTECTED_ROUTES.
- Risk #4: Prove PATCH/DELETE to /api/transactions/[id] using User B's resource ID returns 404 or 403 and leaves User B's row unchanged after the call. Challenge: "RLS UPDATE is enabled" ≠ "policy has both USING and WITH CHECK" — lessons.md records this was once missing.
