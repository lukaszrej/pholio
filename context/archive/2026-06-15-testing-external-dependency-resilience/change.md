---
change_id: testing-external-dependency-resilience
title: External dependency resilience tests (Phase 3)
status: archived
created: 2026-06-15
updated: 2026-06-17
archived_at: 2026-06-17T16:51:21Z
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "External dependency resilience".
Risks covered: #5 (Finnhub outage — dashboard crashes or shows zero/stale price without the required fallback indicator).
Test types planned: Integration (mock Finnhub HTTP, real Supabase cache).
Risk response intent:

- Risk #5: Prove that when the Finnhub HTTP call times out or returns 5xx, the dashboard renders with the last cached price and a ⚠ indicator; and when no cache exists, "brak danych" is shown without throwing. Challenge: "fallback code exists in the plan" ≠ "fallback actually fires under test conditions" — AbortController timeout must actually trigger. Anti-pattern to avoid: only testing the happy path (successful Finnhub response).
