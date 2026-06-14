# Business Logic Unit Suite Implementation Plan

## Overview

Bootstrap Vitest (plain, no `@cloudflare/vitest-pool-workers`) and write the project's first automated tests: a unit suite covering the two highest-priority business-logic risks from `context/foundation/test-plan.md` — Risk #1 (ROI / position-aggregation math) and Risk #6 (Finnhub zero-price guard). This is rollout Phase 1 of the test plan; it establishes the test runner, the colocated test convention, and the cookbook §6.1 entry that all later phases build on.

## Current State Analysis

The project has **zero test infrastructure**: no `vitest`, no `vitest.config.*`, no `test` script in `package.json`. CI (`.github/workflows/ci.yml`) runs lint + build only. The functions under test are already implemented and pure:

- `computePositions(transactions, prices)` — `src/lib/portfolio.ts:97-147`. Groups transactions by upper-cased ticker, computes weighted-average cost, position value, and ROI (% and absolute). Pure: no DB, no `fetch`.
- `computePortfolioSummary(positions)` — `src/lib/portfolio.ts:41-63`. Rolls up `roiAbs` into total P&L and `totalPnLPct`. Pure.
- `fetchQuote(ticker)` — `src/lib/finnhub.ts:34-63`. Calls Finnhub `/quote`, returns `number | null`. Guards `c === 0`. Impure only at the `fetch` edge; imports `FINNHUB_API_KEY` from the virtual module `astro:env/server`.

### Key Discoveries:

- **No division-by-zero guard at `portfolio.ts:124`** — `roiPct` divides by `avgCost` unconditionally. However, `transactionSchema` forces `purchase_price` and `shares` both `.positive()` (`src/lib/transaction-schema.ts:10,17`), so `avgCost` is always > 0 through validated input. The edge is unreachable; it is documented as out of scope (see "What We're NOT Doing").
- **Null price renders as `"—"`, not `"brak danych"`** (`src/components/portfolio/PortfolioSection.tsx:118-120`). The fetchQuote test asserts a `null` return value, never a UI string.
- **`fetchQuote` imports `astro:env/server`** (`src/lib/finnhub.ts:1`) — a Vite/Astro virtual module that does not resolve under plain Vitest. This must be aliased to a stub in `vitest.config.ts` or the import throws before any test runs. This is the single load-bearing setup detail (see Critical Implementation Details).
- **TS path alias `@/* → ./src/*`** (`tsconfig.json:9-10`) is used by `portfolio.ts` (`@/types/transaction`) and must be mirrored in the Vitest config.
- **Hand-calculable oracle exists for every ROI case** — e.g. 10sh@$100 + 10sh@$200 → avgCost = 3000/20 = 150; @$180 → roiAbs = (180−150)×20 = 600, roiPct = (180−150)/150×100 = 20%. Expected values are derived independently, never by running the function under test.
- **Lessons priors apply**: double quotes in all TS files (`lessons.md`), Zod v4 standalone schemas, `"prepare": "husky"` already wired — new test files must pass the existing lint-staged hook.

## Desired End State

`npm test` runs a green Vitest suite that fails if any ROI formula, currency-skip rule, or the `c === 0` guard regresses. Specifically:

- `vitest` is a devDependency; `vitest.config.ts` exists; `package.json` has `test` and `test:watch` scripts.
- `src/lib/portfolio.test.ts` asserts weighted-average cost, roiAbs, roiPct, multi-currency null-out, null-price null-out, ticker-case aggregation, weightPct, and the P&L summary roll-up — all against hand-calculated oracles.
- `src/lib/finnhub.test.ts` asserts fetchQuote returns the quote on success and `null` on every documented failure path (c===0, falsy c, non-OK response, missing key, fetch throw).
- `context/foundation/test-plan.md` §6.1 is filled in with the real location, naming, reference test, and run command; §3 Phase 1 is ready to be marked `complete`.

### Verify:

1. `npm test` exits 0 with all tests passing.
2. `npm run lint` passes on the new test files (double quotes, no unused vars).
3. `npm run typecheck` (`astro check`) still passes.
4. Temporarily breaking a formula (e.g. change `* 100` to `* 10` at `portfolio.ts:124`) makes the suite fail — proving the tests have real signal.

## What We're NOT Doing

- **No `@cloudflare/vitest-pool-workers`** — both targets are pure / fetch-mockable; the Workers runtime is not exercised.
- **No avgCost=0 / division-by-zero test** — unreachable through validated input (`transactionSchema` `.positive()` on shares and price). Documented here so a future reader doesn't re-litigate it.
- **No `computeSectorAllocation` / `fetchSector` tests** — sector allocation (S-05) is not in the test-plan risk map; covering it now is coverage-for-coverage's-sake.
- **No integration or DB tests** — cross-user RLS, unauthenticated API, and IDOR are test-plan §3 Phase 2.
- **No Finnhub outage / fallback-cascade test** — that is the dashboard.astro server path, test-plan §3 Phase 3.
- **No CI YAML changes** — wiring the suite into `ci.yml` is test-plan §3 Phase 4. This phase only adds the local `test` script.
- **No edits to production source** — this phase adds tests around existing behavior; it changes no `src/` logic.

## Implementation Approach

Four sequential phases, each independently verifiable. Phase 1 bootstraps the runner and proves it executes (a failing-then-passing smoke test). Phase 2 covers the pure portfolio math — the highest-likelihood risk — with zero mocking. Phase 3 covers fetchQuote, which needs `global.fetch` mocked and `astro:env/server` stubbed. Phase 4 backfills the cookbook so the convention is documented for later phases and for `/10x-tdd`.

## Critical Implementation Details

**`astro:env/server` virtual module.** `src/lib/finnhub.ts:1` does `import { FINNHUB_API_KEY } from "astro:env/server"`. Plain Vitest cannot resolve this id and the import will throw at module-load time — before any `vi.mock` factory runs — unless the id is resolvable. Make it resolvable via a `resolve.alias` entry in `vitest.config.ts` pointing `astro:env/server` at a small test stub module that exports a **mutable** `FINNHUB_API_KEY`. The mutability matters: Phase 3 needs to toggle the key between a truthy value (to exercise the fetch path) and a falsy value (to exercise the `!FINNHUB_API_KEY → null` early return at `finnhub.ts:35`). A `vi.mock("astro:env/server", …)` factory is an acceptable alternative only if the alias is also present so Vite can resolve the id; the alias-to-stub approach is the robust default.

**Oracle independence.** Every expected number in Phase 2 is computed by hand in the test (or in a comment), never by calling the function under test and snapshotting its output. A test whose expected value came from the implementation can never catch a bug in that implementation.

---

## Phase 1: Bootstrap Vitest

### Overview

Install Vitest, configure it for this stack (node environment, `@` alias, `astro:env/server` stub), add npm scripts, and prove the runner executes with a trivial smoke test.

### Changes Required:

#### 1. Install Vitest

**File**: `package.json` (devDependencies)

**Intent**: Add `vitest` as the test runner. No other test packages are needed for this phase.

**Contract**: `npm install --save-dev vitest`. Do not add `@cloudflare/vitest-pool-workers`, `jsdom`, or `@vitest/ui` — none are needed for pure-function + fetch-mock tests.

#### 2. Vitest config

**File**: `vitest.config.ts` _(new file)_

**Intent**: Configure Vitest to run in a node environment, resolve the project's `@/*` alias, and resolve the `astro:env/server` virtual module to a test stub so `finnhub.ts` can be imported.

**Contract**: Export a `defineConfig` from `vitest/config` with: `test.environment = "node"`, `test.globals = true`, and `resolve.alias` mapping both `@` → `./src` and `astro:env/server` → the stub file from change #3. Use double quotes (lint rule).

#### 3. `astro:env/server` test stub

**File**: `src/test/stubs/astro-env-server.ts` _(new file)_

**Intent**: Provide a resolvable module standing in for the Astro virtual env module, exporting a mutable API key the fetchQuote tests can toggle.

**Contract**: Export a `let FINNHUB_API_KEY: string | undefined` initialized to a truthy test value (e.g. `"test-key"`). Must be reassignable so Phase 3 can set it to `undefined`. Double quotes.

#### 4. Test scripts

**File**: `package.json` (scripts)

**Intent**: Give a one-word command to run the suite once (CI-style) and a watch mode for local dev.

**Contract**: Add `"test": "vitest run"` and `"test:watch": "vitest"`. Do not modify the existing `lint`, `typecheck`, or `build` scripts.

#### 5. Smoke test

**File**: `src/lib/smoke.test.ts` _(new file, temporary)_

**Intent**: Prove the runner, config, and alias resolution all work before writing real tests. Removed at the end of this phase.

**Contract**: A single `expect(true).toBe(true)` plus one assertion that imports something through the `@` alias (e.g. imports `CURRENCIES` from `@/lib/transaction-schema` and asserts it includes `"USD"`) to prove alias resolution. Delete this file once Phase 2 lands a real test.

### Success Criteria:

#### Automated Verification:

- `npm test` runs and the smoke test passes
- `npm run lint` passes on `vitest.config.ts` and the stub file
- `npm run typecheck` still passes

#### Manual Verification:

- Temporarily change the smoke assertion to `expect(true).toBe(false)` and confirm `npm test` exits non-zero, proving the runner actually executes assertions

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 2: Portfolio math unit tests (Risk #1)

### Overview

Test `computePositions` and `computePortfolioSummary` against hand-calculated oracles. This is the highest-likelihood risk (hot-spot `src/lib/` 24c/30d, `src/components/transactions/` 39c/30d) and the cheapest layer.

### Changes Required:

#### 1. computePositions tests

**File**: `src/lib/portfolio.test.ts` _(new file)_

**Intent**: Assert every ROI/aggregation rule with independently computed expected values, covering the happy path and each null-out branch.

**Contract**: A `describe("computePositions")` block with at least these cases, each using a hand-built `Transaction[]` and `Record<string, PriceData>`:

- **Single purchase** — 10sh @ $100, price $150 → `avgCost` 100, `roiAbs` 500, `roiPct` 50, `positionValue` 1500.
- **Multi-purchase weighted average** — 10sh@$100 + 10sh@$200, price $180 → `avgCost` 150, `roiAbs` 600, `roiPct` 20. (Guards against a naive non-weighted average, which would give avgCost 150 here too — so add a second uneven case: 10sh@$100 + 30sh@$200 → weighted avgCost = (1000+6000)/40 = 175, which a simple mean (150) would get wrong.)
- **Multi-currency null-out** — same ticker bought in USD and EUR → `hasMultipleCurrencies` true, `currency` `"MULTI"`, `roiAbs` and `roiPct` both `null`, `currency` excluded from ROI.
- **Null / missing price** — ticker absent from `prices` map → `currentPrice` null, `positionValue` null, `roiAbs` null, `roiPct` null.
- **Ticker case aggregation** — `"aapl"` and `"AAPL"` in the same input aggregate into one position (proves `.toUpperCase()` grouping at `portfolio.ts:101`).
- **weightPct** — two valued positions → each `weightPct` reflects its share of total value, summing to ~100; a position with null price → `weightPct` null.
- **Empty input** — `[]` → `[]`.

Expected numbers are written as literals with a comment showing the arithmetic. No expected value is produced by calling `computePositions`.

#### 2. computePortfolioSummary tests

**File**: `src/lib/portfolio.test.ts` (same file, new `describe`)

**Intent**: Assert the P&L roll-up the user actually reads, including the multi-currency exclusion.

**Contract**: A `describe("computePortfolioSummary")` block taking `PortfolioPosition[]` (built directly or via `computePositions` on fixtures) and asserting: `totalInvested` = sum of cost bases; `totalPnL` = sum of non-null `roiAbs`; `totalPnLPct` = totalPnL / pnlCostBasis × 100; `currentValue` null when no position has a price; `excludedCount` counts multi-currency positions; `currency` is the single shared currency or null when mixed. Include a case with one valued + one null-price position to confirm null positions don't corrupt the totals.

### Success Criteria:

#### Automated Verification:

- `npm test` passes with all portfolio tests green
- `npm run lint` passes on the test file
- Mutation check: changing `* 100` → `* 10` at `portfolio.ts:124` makes the suite fail (revert after confirming)

#### Manual Verification:

- Re-derive two expected values by hand and confirm they match the literals in the test, ensuring no oracle was copied from the implementation

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 3: fetchQuote unit tests (Risk #6)

### Overview

Test `fetchQuote` by mocking `global.fetch` and toggling the stubbed `FINNHUB_API_KEY`. Asserts the `c === 0` guard and every other `null` path. Frame: this is a regression anchor for the three-layer zero-price defense (guard + conditional write + DB CHECK), not proof of an unhandled scenario.

### Changes Required:

#### 1. fetchQuote tests

**File**: `src/lib/finnhub.test.ts` _(new file)_

**Intent**: Assert fetchQuote returns the price on success and `null` on each documented failure mode, with `fetch` mocked at the global edge.

**Contract**: A `describe("fetchQuote")` block. Use `vi.fn()` for `global.fetch` (set in `beforeEach`, restored in `afterEach`). Cases:

- **Valid quote** — `fetch` resolves `{ ok: true, json: async () => ({ c: 123.45 }) }` → returns `123.45`.
- **c === 0** — json `{ c: 0 }` → returns `null` (the named guard at `finnhub.ts:53`).
- **Falsy c** — json `{ c: undefined }` (or missing `c`) → returns `null`.
- **Non-OK response** — `{ ok: false }` → returns `null` (no json parse needed).
- **Missing API key** — set the stub's `FINNHUB_API_KEY` to `undefined` → returns `null` without calling `fetch` (assert `fetch` not called).
- **Fetch throws / aborts** — `fetch` rejects → returns `null` (the catch at `finnhub.ts:56-59`).

Restore the API key in `afterEach` so cases don't leak state. Double quotes throughout.

### Success Criteria:

#### Automated Verification:

- `npm test` passes with all fetchQuote tests green
- `npm run lint` passes
- Mutation check: removing the `|| data.c === 0` clause at `finnhub.ts:53` makes the c===0 test fail (revert after confirming)

#### Manual Verification:

- Confirm the "missing API key" test asserts `fetch` was never called, not merely that the result is null

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 4: Cookbook update (test-plan §6.1)

### Overview

Backfill the test-plan cookbook so "how to add a unit test here" is documented, and remove the temporary smoke test.

### Changes Required:

#### 1. Remove smoke test

**File**: `src/lib/smoke.test.ts` _(delete)_

**Intent**: The smoke test served its purpose in Phase 1; the real suites now prove the runner works.

**Contract**: Delete the file. `npm test` still passes afterward.

#### 2. Fill cookbook §6.1

**File**: `context/foundation/test-plan.md` (§6.1)

**Intent**: Replace the `TBD — see §3 Phase 1` placeholder with the concrete convention this phase established.

**Contract**: §6.1 states: location = colocated (`src/lib/<module>.test.ts`); naming = `<module>.test.ts`; reference test = `src/lib/portfolio.test.ts`; run command = `npm test` (watch: `npm run test:watch`); mocking note for `astro:env/server` virtual module (alias to `src/test/stubs/astro-env-server.ts`). Do not touch §1–§5 or the §3 status cell (the orchestrator owns that).

### Success Criteria:

#### Automated Verification:

- `npm test` passes after smoke-test deletion
- `context/foundation/test-plan.md` §6.1 no longer contains "TBD"

#### Manual Verification:

- A reader unfamiliar with the project can add a new unit test by following §6.1 alone

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation. This is the final phase — once confirmed, §3 Phase 1 can be marked `complete` via `/10x-test-plan`.

---

## Testing Strategy

### Unit Tests:

- `computePositions`: weighted-average cost (including uneven share counts), roiAbs, roiPct, multi-currency null-out, null-price null-out, ticker-case aggregation, weightPct, empty input.
- `computePortfolioSummary`: totalInvested, totalPnL, totalPnLPct, currentValue, excludedCount, currency resolution, null-position resilience.
- `fetchQuote`: success, c===0, falsy c, non-OK response, missing key, fetch throw.

### Manual Testing Steps:

1. Run `npm test` — all green.
2. Break one formula and one guard (separately) and confirm the relevant test fails (signal check).
3. Re-derive two oracle values by hand to confirm independence.

## Performance Considerations

None. Pure-function unit tests run in milliseconds; no DB, no network, no Workers runtime.

## Migration Notes

None — additive only. No production source changes.

## References

- Research: `context/changes/testing-business-logic-unit-suite/research.md`
- Test plan (parent): `context/foundation/test-plan.md` §2 (Risk #1, #6), §3 Phase 1, §6.1
- Functions under test: `src/lib/portfolio.ts:41-63,97-147`, `src/lib/finnhub.ts:34-63`
- Input validation that bounds the edge cases: `src/lib/transaction-schema.ts:10,17`
- Lessons priors: `context/foundation/lessons.md` (double quotes, Zod v4, husky)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bootstrap Vitest

#### Automated

- [x] 1.1 `npm test` runs and the smoke test passes
- [x] 1.2 `npm run lint` passes on `vitest.config.ts` and the stub file
- [x] 1.3 `npm run typecheck` still passes

#### Manual

- [x] 1.4 Flipping the smoke assertion to false makes `npm test` exit non-zero

### Phase 2: Portfolio math unit tests (Risk #1)

#### Automated

- [ ] 2.1 `npm test` passes with all portfolio tests green
- [ ] 2.2 `npm run lint` passes on the test file
- [ ] 2.3 Mutation check: `* 100` → `* 10` at `portfolio.ts:124` makes the suite fail (then revert)

#### Manual

- [ ] 2.4 Two expected values re-derived by hand match the test literals

### Phase 3: fetchQuote unit tests (Risk #6)

#### Automated

- [ ] 3.1 `npm test` passes with all fetchQuote tests green
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 Mutation check: removing `|| data.c === 0` at `finnhub.ts:53` makes the c===0 test fail (then revert)

#### Manual

- [ ] 3.4 The "missing API key" test asserts `fetch` was never called

### Phase 4: Cookbook update (test-plan §6.1)

#### Automated

- [ ] 4.1 `npm test` passes after smoke-test deletion
- [ ] 4.2 `context/foundation/test-plan.md` §6.1 no longer contains "TBD"

#### Manual

- [ ] 4.3 A reader can add a new unit test following §6.1 alone
