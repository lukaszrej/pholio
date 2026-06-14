# Business Logic Unit Suite — Plan Brief

> Full plan: `context/changes/testing-business-logic-unit-suite/plan.md`
> Research: `context/changes/testing-business-logic-unit-suite/research.md`

## What & Why

Bootstrap Vitest and write Pholio's first automated tests, covering the two highest-priority business-logic risks from the test plan: the ROI / position-aggregation math (Risk #1 — "user sees incorrect profit/loss") and the Finnhub zero-price guard (Risk #6). The PRD names ROI correctness a hard guardrail: "błąd matematyczny jest gorszy niż brak funkcji."

## Starting Point

The project has zero test infrastructure — no Vitest, no config, no `test` script; CI runs lint + build only. The three functions under test are already implemented and pure (or fetch-mockable): `computePositions` and `computePortfolioSummary` (`src/lib/portfolio.ts`) and `fetchQuote` (`src/lib/finnhub.ts`).

## Desired End State

`npm test` runs a green Vitest suite that fails the moment any ROI formula, currency-skip rule, or the `c === 0` guard regresses. The colocated test convention is established and documented in test-plan §6.1, unblocking later rollout phases and `/10x-tdd`.

## Key Decisions Made

| Decision                  | Choice                                                  | Why                                                                                     | Source   |
| ------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| Test runner               | Plain Vitest, no pool-workers                           | Targets are pure / fetch-mockable; Workers runtime not exercised                        | Research |
| Function scope            | computePositions + computePortfolioSummary + fetchQuote | Covers Risk #1 end-to-end (per-position AND total P&L) + Risk #6, no scope creep        | Plan     |
| avgCost=0 edge            | Skip, document as out of scope                          | Unreachable via Zod `.positive()` on shares & price; testing it violates cost×signal    | Plan     |
| Test file location        | Colocated (`src/lib/portfolio.test.ts`)                 | Vitest default, matches TS colocation norm, minimal config                              | Plan     |
| `astro:env/server` import | Alias to a mutable test stub                            | Virtual module won't resolve under plain Vitest; mutability lets Phase 3 toggle the key | Research |
| Oracle source             | Hand-calculated literals                                | Avoids the oracle problem — expected values never come from the code under test         | Research |
| CI wiring                 | Deferred to test-plan §3 Phase 4                        | Lesson boundary forbids CI YAML here; gates are a later phase                           | Plan     |

## Scope

**In scope:** Vitest install + config + stub + scripts; unit tests for `computePositions`, `computePortfolioSummary`, `fetchQuote`; test-plan §6.1 cookbook entry.

**Out of scope:** avgCost=0 test; `computeSectorAllocation` / `fetchSector`; integration / RLS / API tests (Phase 2); Finnhub outage cascade (Phase 3); CI YAML (Phase 4); any production source change.

## Architecture / Approach

Plain Vitest in a node environment. `vitest.config.ts` mirrors the `@/* → src/*` alias and adds an alias for the `astro:env/server` virtual module pointing at `src/test/stubs/astro-env-server.ts` (a mutable `FINNHUB_API_KEY`). Portfolio tests need no mocking; fetchQuote tests mock `global.fetch` and toggle the stubbed key. Every expected number is hand-derived.

## Phases at a Glance

| Phase                   | What it delivers                                           | Key risk                                            |
| ----------------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| 1. Bootstrap Vitest     | Runner + config + stub + scripts, proven by a smoke test   | `astro:env/server` resolution wrinkle               |
| 2. Portfolio math suite | computePositions + computePortfolioSummary tests (Risk #1) | Oracle independence — no values copied from code    |
| 3. fetchQuote suite     | All `null`-path + success tests (Risk #6)                  | fetch mock + key-toggle state leaking between tests |
| 4. Cookbook update      | test-plan §6.1 filled; smoke test removed                  | None — documentation only                           |

**Prerequisites:** None — additive, no upstream blockers.
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- Assumes Node's global `fetch` / `AbortController` are available under Vitest (Node 18+) — true for this toolchain.
- Assumes the `astro:env/server` alias fully substitutes for Astro's virtual module at test time; if `finnhub.ts` later imports more from it, the stub must grow.
- The three-layer zero-price defense means Risk #6 tests are regression anchors, not proof of an unhandled bug.

## Success Criteria (Summary)

- `npm test` is green and lint/typecheck still pass.
- Breaking any ROI formula or the `c === 0` guard turns the suite red (signal proven via mutation checks).
- A new contributor can add a unit test by following test-plan §6.1 alone.
