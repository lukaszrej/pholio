# External Dependency Resilience Tests (Phase 3) — Plan Brief

> Full plan: `context/changes/testing-external-dependency-resilience/plan.md`
> Research: `context/changes/testing-external-dependency-resilience/research.md`

## What & Why

Phase 3 of the test-plan rollout proves **Risk #5**: a Finnhub outage must
neither crash the dashboard nor silently mislead the user. The fallback code
exists, but "fallback code exists" ≠ "fallback fires under outage conditions" —
so we test it. The blocker is that the fetch-and-fallback cascade is inline in
`dashboard.astro` with no testable seam, so we extract it first.

## Starting Point

`fetchQuote` (`src/lib/finnhub.ts`) is already hardened — it returns `null` on
every failure including the 2500ms `AbortController` timeout. But the cache
cascade (SELECT prices → fetchQuote → upsert / stale-reuse / omit) lives inline
in `dashboard.astro:33–64` and can only run inside a live Astro server. Phase 1
unit tests cover `fetchQuote`'s failure modes except the timeout; nothing covers
the cascade. The Phase 2 integration harness (plain Node + real local Supabase +
`.env.test`) is ready to reuse.

## Desired End State

A testable `src/lib/prices.ts` owns the cascade and the dashboard calls it (no
user-visible change). The timeout path is proven in a unit test; the cache
fallback is proven against real Supabase in two integration cases. The test-plan
cookbook §6.3 documents the external-HTTP pattern, and stale §4/Risk #5 wording
is reconciled with the implemented reality.

## Key Decisions Made

| Decision                   | Choice                                                               | Why (1 sentence)                                                                    | Source   |
| -------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| Testability prerequisite   | Extract cascade into `src/lib/prices.ts`                             | No integration seam exists otherwise; pure low-risk move unlocks the whole matrix.  | Research |
| UI signal scope            | Accept existing gray-text + em-dash + `is_fresh`; no ⚠/"brak danych" | Keeps Phase 3 a pure test phase and honors §7's no-UI-snapshot stance.              | Plan     |
| Timeout proof              | Split: fake-timers **unit** + real-Supabase fallback **integration** | Fake timers must not interfere with Supabase's own fetch/timers.                    | Plan     |
| Assert layer               | `refreshPricesForTickers` + `computePositions` data, not rendering   | Deterministic and cheap; renders are brittle and deprioritized in §7.               | Plan     |
| Sector scope               | Prices only; `fetchSector` stays inline                              | Sectors are not a tracked risk; matches Risk #5's scope.                            | Plan     |
| Timeout test home          | New case in existing `finnhub.test.ts` (unit)                        | Reuses the proven mock pattern and keeps fake timers out of the integration suite.  | Plan     |
| HTTP mock mechanism        | `vi.spyOn(global, "fetch")`, not `undici` MockAgent                  | Consistent with `finnhub.test.ts`; `undici` adds surface for no gain in plain Node. | Research |
| Cache-integrity assertions | Stale-row-preserved (primary) + no-cache behavioral path             | Covers both halves of Risk #5; write-through/freshness tests de-scoped.             | Plan     |

## Scope

**In scope:**

- Extract the price cascade into `src/lib/prices.ts`; rewire `dashboard.astro`.
- Unit test: `AbortController` 2500ms timeout → `null` (fake timers).
- Integration tests: stale-cache fallback + no-cache fallback (real Supabase).
- Cookbook §6.3 + reconcile §4/Risk #5 wording + flip §3 Phase 3 status.

**Out of scope:**

- Any UI change (⚠ icon, "brak danych" string).
- `fetchSector` extraction / sector resilience.
- React-component render tests.
- Dedicated happy-path write-through and freshness-short-circuit tests.
- CI wiring (Phase 4) and the Workers-runtime test pool.

## Architecture / Approach

`refreshPricesForTickers(tickers, supabase)` takes the Supabase client as a
parameter (DI): production passes the SSR client, tests pass a service-role
client. Finnhub is mocked at the `global.fetch` boundary that `fetchQuote` calls
internally. The timeout proof is isolated in a unit test with fake timers; the
integration tests use immediately-resolving failure mocks so fake timers never
collide with real Supabase I/O. Tests seed/clean a single `prices` row (global
table, no `user_id`) with a unique per-run ticker.

## Phases at a Glance

| Phase                     | What it delivers                                            | Key risk                                                        |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| 1. Extract price cascade  | `src/lib/prices.ts` + rewired dashboard, no behavior change | Behavior drift during the move (concurrency, omit-on-null path) |
| 2. Resilience test matrix | Unit timeout case + 2 integration fallback cases            | Fake timers interfering with Supabase if not isolated           |
| 3. Cookbook + close-out   | §6.3 filled, wording reconciled, status flipped             | Leaving §4/Risk #5 wording contradicting reality                |

**Prerequisites:** Local Supabase running (`npx supabase start`); `.env.test`
populated (already present from Phase 2).
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Extraction must be behavior-identical; the `Promise.allSettled` + `pLimit(10)`
  - date-only freshness + omit-on-null semantics are easy to subtly change.
- Fake timers and real Supabase fetch must stay in separate test files.
- The global `prices` table is shared across test runs — unique per-run tickers
  and teardown prevent cross-run contamination.

## Success Criteria (Summary)

- A simulated Finnhub outage with a cached price keeps showing that price flagged
  stale (`is_fresh:false`), and the cached row is not corrupted.
- A simulated outage with no cache yields no price (`currentPrice:null`) and no
  crash and no bogus row — the data-layer "brak danych" signal.
- The 2500ms timeout is proven to actually fire and return `null`.
