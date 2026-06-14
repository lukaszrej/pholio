---
date: 2026-06-14T00:00:00+00:00
researcher: claude-sonnet-4-6
git_commit: 6d21a7c3c1dc5c6117adcb8e792eeb625050a3ad
branch: main
repository: lukaszrej/pholio
topic: "Ground rollout Phase 1: business logic unit suite (Risk #1 ROI computation, Risk #6 price guard)"
tags: [research, testing, portfolio, roi, finnhub, vitest]
status: complete
last_updated: 2026-06-14
last_updated_by: claude-sonnet-4-6
---

# Research: Business Logic Unit Suite — Phase 1 Grounding

**Date**: 2026-06-14
**Researcher**: claude-sonnet-4-6
**Git Commit**: 6d21a7c3c1dc5c6117adcb8e792eeb625050a3ad
**Branch**: main
**Repository**: lukaszrej/pholio

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md`. Verify and correct response guidance for Risk #1 (computePositions() ROI formula) and Risk #6 (Finnhub c===0 zero-price guard). Identify cheapest test layer, exact code anchors, and edge cases for each risk.

## Summary

Both risks are real and testable at the unit layer with plain Vitest (no pool-workers needed). The ROI computation is a pure function with well-defined edge cases; the price-guard is also pure (mock `fetch` only). No test infrastructure exists — Phase 1 bootstraps Vitest.

**Key corrections to the test-plan brief:**

1. The UI renders `"—"` (em-dash) for null prices, not `"brak danych"`. The test assertion for R6 must check for null propagation, not a specific string.
2. Risk #6's "user sees $0 current price" scenario is protected by three independent layers already in code. The test value is as a regression anchor for the guard, not to prove the scenario is unhandled.

---

## Detailed Findings

### Risk #1 — computePositions() ROI formula

#### Function location and signature

`src/lib/portfolio.ts:97-147`

```typescript
export function computePositions(transactions: Transaction[], prices: Record<string, PriceData>): PortfolioPosition[];
```

#### Output type

`src/lib/portfolio.ts:9-23`

```typescript
export interface PortfolioPosition {
  ticker: string;
  totalShares: number;
  avgCost: number;
  currency: string;
  hasMultipleCurrencies: boolean;
  currentPrice: number | null;
  isFresh: boolean;
  priceDate: string | null;
  costBasis: number;
  positionValue: number | null;
  weightPct: number | null;
  roiPct: number | null;
  roiAbs: number | null;
}
```

#### The exact formulas (file:line anchors for planning)

| Computation             | Formula                                                                                             | Location                      |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------- |
| Group transactions      | `ticker.toUpperCase()` as key                                                                       | `src/lib/portfolio.ts:98-108` |
| `totalShares`           | `sum(t.shares)`                                                                                     | `src/lib/portfolio.ts:111`    |
| `weightedSum`           | `sum(t.shares * t.purchase_price)`                                                                  | `src/lib/portfolio.ts:112`    |
| `avgCost`               | `weightedSum / totalShares` if `totalShares > 0`, else `0`                                          | `src/lib/portfolio.ts:113`    |
| `hasMultipleCurrencies` | `new Set(txns.map(t => t.currency)).size > 1`                                                       | `src/lib/portfolio.ts:114`    |
| `costBasis`             | `avgCost * totalShares`                                                                             | `src/lib/portfolio.ts:121`    |
| `positionValue`         | `currentPrice != null ? currentPrice * totalShares : null`                                          | `src/lib/portfolio.ts:122`    |
| `roiAbs`                | `(currentPrice - avgCost) * totalShares` (only if `!hasMultipleCurrencies && currentPrice != null`) | `src/lib/portfolio.ts:123`    |
| `roiPct`                | `((currentPrice - avgCost) / avgCost) * 100` (same guard)                                           | `src/lib/portfolio.ts:124`    |
| `weightPct`             | `positionValue / totalValue * 100` if `positionValue != null && totalValue > 0`, else `null`        | `src/lib/portfolio.ts:145`    |

#### Edge cases verified in code

| Scenario                           | Behavior                                                                   | Confidence                                               |
| ---------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| Single purchase                    | Straightforward weighted avg = purchase_price                              | Confirmed by formula                                     |
| Multi-purchase same ticker         | `avgCost = sum(shares*price) / sum(shares)` — weighted, not simple average | Confirmed at line 112-113                                |
| Multi-currency position            | `roiAbs = null`, `roiPct = null`, `currency = "MULTI"`                     | Confirmed at lines 114-115, 123-124                      |
| Null price (no market data)        | `roiAbs = null`, `roiPct = null`, `positionValue = null`                   | Confirmed at lines 118, 122-124                          |
| Zero totalShares                   | `avgCost = 0` (division guard at line 113)                                 | Confirmed — `if totalShares > 0`                         |
| Zero avgCost (all purchases at $0) | `roiPct` divides by `avgCost = 0` → `Infinity` or `NaN`                    | **Unconfirmed — needs plan to verify guard at line 124** |
| Empty transactions array           | Returns `[]`                                                               | Implied by grouping logic                                |
| Empty prices map                   | All `currentPrice = null`, all ROI = null                                  | Confirmed via `priceEntry?.price ?? null`                |

**Plan flag:** The agent reported a guard `avgCost > 0` before the roiPct division. This must be verified line-by-line in planning — if avgCost is 0 and the guard is absent, `roiPct` would be `Infinity`. This is a subtle edge case worth a dedicated test.

#### Where computePositions() is called

- `src/components/transactions/DashboardView.tsx:251-252` — `useMemo(() => computePositions(transactions, prices), [transactions, prices])` — global all-positions
- `src/components/transactions/DashboardView.tsx:264-271` — per-portfolio position count (calls computePositions per portfolio)
- `src/components/transactions/DashboardView.tsx:275-280` — active-tab summary (calls computePositions for active portfolio tab)

All three uses are memoized. The function is **pure** — no side effects, no DB calls, no fetch. Ideal for unit testing.

#### How ROI is displayed

- `src/components/portfolio/PortfolioSection.tsx:415` — `roiAbs !== null ? formatSigned(pos.roiAbs) : "—"`
- `src/components/portfolio/PortfolioSection.tsx:421` — `roiPct !== null ? formatSigned(pos.roiPct) + "%" : "—"`

The `"—"` em-dash is the null sentinel displayed to users.

#### computePortfolioSummary() — companion function

`src/lib/portfolio.ts:41-63`

Takes `PortfolioPosition[]` as input, returns `PortfolioSummary`. Relevant for understanding how roiAbs rolls up to total P&L. In-scope for the unit suite since it depends directly on `computePositions()` output.

---

### Risk #6 — fetchQuote() c===0 guard and null propagation

#### Function location and signature

`src/lib/finnhub.ts:34-63`

```typescript
export async function fetchQuote(ticker: string): Promise<number | null>;
```

#### The c===0 guard — exact code

`src/lib/finnhub.ts:53`:

```typescript
if (!data.c || data.c === 0) return null; // c === 0 means no market data for this symbol
```

The guard uses `||` to catch both falsy (undefined, null) and the explicit zero case. Returns `null` — not `0`, not `undefined`.

#### Cache write conditionality

`src/pages/dashboard.astro:51-60`:

```typescript
const quote = await fetchQuote(ticker);
if (quote !== null) {
  // upsert to prices table — only fires when quote is a real number
  await sb.from("prices").upsert({ ticker, price: quote, fetched_at });
  prices[ticker] = { price: quote, fetched_at, is_fresh: true };
} else if (cached) {
  prices[ticker] = { price: cached.price, fetched_at: cached.fetched_at, is_fresh: false };
}
// if quote === null AND no cache: prices[ticker] remains undefined
```

When `fetchQuote` returns `null`:

1. Cache write is **skipped** — no upsert
2. If a prior cached value exists → it is used (marked `is_fresh: false`)
3. If no prior cache → `prices[ticker]` is never set → `currentPrice = null` in computePositions → "—" in UI

#### Three-layer defense (important for test framing)

| Layer                 | What it does                              | Location                                                 |
| --------------------- | ----------------------------------------- | -------------------------------------------------------- |
| L1: fetchQuote guard  | Returns null when `c === 0`               | `src/lib/finnhub.ts:53`                                  |
| L2: Conditional write | Only upserts when `quote !== null`        | `src/pages/dashboard.astro:52`                           |
| L3: DB constraint     | `CHECK (price > 0)` rejects zero/negative | `supabase/migrations/20260609000000_create_prices.sql:4` |

Risk #6 as stated ("user sees $0 current price") is prevented by all three layers. **The test value is as a regression anchor** — to prove these guards survive future refactoring of the finnhub.ts / dashboard.astro pipeline.

#### Correct null-price UI behavior

The UI renders `"—"` (em-dash), **not** `"brak danych"`.

- `src/components/portfolio/PortfolioSection.tsx:118-120`: `if (pos.currentPrice === null) return "—"`
- `src/components/portfolio/PortfolioSummaryCard.tsx:57`: `currentValue !== null ? currentValue.toFixed(2) : "—"`

**Test-plan brief correction:** §2 Risk #6 description says "user sees $0 current price" and the response guidance mentions `"brak danych"`. The actual null-price UI behavior is `"—"` at every render site. The fetchQuote unit test should verify null is returned (not $0), but the UI string "brak danych" does not exist in code.

#### Today's cache optimization

`src/pages/dashboard.astro:29, 46-48`:

```typescript
const today = new Date().toISOString().split("T")[0]; // "2026-06-14"
// ...
if (cached?.fetched_at.split("T")[0] === today) {
  prices[ticker] = { price: cached.price, fetched_at: cached.fetched_at, is_fresh: true };
  return; // skips fetchQuote entirely
}
```

This optimization is in `dashboard.astro` (server-side Astro component), not in `fetchQuote` itself. The unit test for `fetchQuote` does not need to test this path — it belongs to the Finnhub resilience integration test (Phase 3 of the rollout).

---

### Vitest setup assessment

#### Stack compatibility

| Check                                       | Result                                      |
| ------------------------------------------- | ------------------------------------------- |
| `compatibility_date` in wrangler.jsonc      | `2026-05-08` — well past 2022-10-31 minimum |
| `nodejs_compat` flag                        | Present in `wrangler.jsonc:6`               |
| TypeScript path alias                       | `"@/*": ["./src/*"]` in tsconfig.json       |
| Vitest installed                            | No — not in package.json                    |
| `@cloudflare/vitest-pool-workers` installed | No — not needed for Phase 1                 |
| Existing test script                        | None                                        |

#### Plain Vitest is sufficient for Phase 1

`computePositions()` and `fetchQuote()` are both pure TypeScript functions:

- `computePositions()` — no Cloudflare bindings, no `fetch`, no `env`. Pure math over typed inputs.
- `fetchQuote()` — calls global `fetch`. Testable by mocking `global.fetch` or using `undici MockAgent`. No Worker bindings required.

`@cloudflare/vitest-pool-workers` is needed only when tests exercise actual Cloudflare runtime APIs (KV, D1, R2, Durable Objects, service bindings). Phase 1 does not.

#### Minimum viable vitest.config.ts

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

The `@` alias is load-bearing — `src/lib/portfolio.ts` imports from `@/types/transaction` and `@/lib/format`.

#### Install command

```bash
npm install --save-dev vitest
```

Then add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

---

## Code References

- `src/lib/portfolio.ts:97-147` — `computePositions()` full implementation
- `src/lib/portfolio.ts:9-23` — `PortfolioPosition` interface
- `src/lib/portfolio.ts:41-63` — `computePortfolioSummary()` companion function
- `src/lib/portfolio.ts:111-115` — Weighted-average + currency detection logic
- `src/lib/portfolio.ts:121-124` — costBasis, positionValue, roiAbs, roiPct formulas
- `src/lib/portfolio.ts:145` — weightPct formula with division guard
- `src/lib/finnhub.ts:34` — `fetchQuote()` signature
- `src/lib/finnhub.ts:53` — c===0 guard: `if (!data.c || data.c === 0) return null;`
- `src/pages/dashboard.astro:51-60` — conditional cache write (null-skip logic)
- `src/pages/dashboard.astro:29, 46-48` — today's cache optimization
- `src/components/transactions/DashboardView.tsx:251-252` — primary `useMemo` for computePositions
- `src/components/portfolio/PortfolioSection.tsx:118-120` — null price renders "—"
- `supabase/migrations/20260609000000_create_prices.sql:4` — `CHECK (price > 0)` constraint
- `src/types/transaction.ts:5-16` — `Transaction` interface (input type for computePositions)

---

## Architecture Insights

1. **computePositions() is the single source of truth for all portfolio math.** It is called in three separate `useMemo` hooks in `DashboardView.tsx`, making it the ideal unit-test target — if this function is correct, all derived UI values are correct.

2. **fetchQuote() is intentionally pure.** It does not write to cache, does not call Supabase — it only calls `fetch` and returns a number or null. The cache write lives in `dashboard.astro`. This means fetchQuote unit tests only need to mock `global.fetch`.

3. **The three-layer c===0 defense means Risk #6 is already well-protected.** The unit test for `fetchQuote` is primarily a regression anchor, not proof of an unhandled scenario.

4. **Ticker normalization is in computePositions, not in the transaction form.** Tickers are uppercased at line 98. A test that submits `"aapl"` and `"AAPL"` in the same position would be interesting — they would aggregate together, which may or may not be the intended behavior.

5. **avgCost division-by-zero edge case.** When `totalShares = 0`, `avgCost = 0`. The `roiPct` formula at line 124 divides by `avgCost` — if `avgCost = 0`, this produces `Infinity` or `NaN`. The planning phase must verify whether a guard exists at line 124 or whether this is an unguarded edge case worth testing.

---

## Research Corrections to Test-Plan §2

Two corrections to surface for potential backport:

1. **R6 null-price display:** The brief says users see `"$0 current price"` or `"brak danych"`. The actual behavior for null price is `"—"` (em-dash) at all render sites. The risk wording should say "position shows '—' without ⚠ indicator" not "shows $0". This does not change the risk priority — the regression anchor is still valid.

2. **R6 risk framing:** The scenario "zero price written to cache" is already prevented by three layers. The risk is better framed as: "the c===0 guard, conditional cache write, and DB constraint are all load-bearing regression anchors; a future refactor could remove any one of them." This makes the test's purpose clear without implying the failure is currently unhandled.

---

## Historical Context

- `context/archive/2026-06-09-portfolio-roi-view/plan.md` — original implementation plan that introduced `computePositions()`, `fetchQuote()`, the `prices` table, and the c===0 guard. Confirms the guard was a planned, deliberate safeguard (not accidental).
- `context/foundation/lessons.md` — L1 (Cloudflare env vars), L3 (RLS WITH CHECK) — neither directly affects Phase 1 unit tests but inform the stack context.

---

## Open Questions

1. **avgCost = 0 in roiPct:** Does `src/lib/portfolio.ts:124` have an explicit `avgCost > 0` guard before dividing? The sub-agent reported it but the exact line was not quoted. The planning phase must read line 124 verbatim and add a test for `roiPct` when `avgCost = 0`.

2. **computePortfolioSummary() in scope?** The function at `portfolio.ts:41-63` is called immediately after `computePositions()` in DashboardView. Including its tests in Phase 1 adds coverage for the P&L roll-up (total ROI across positions). Recommend including — it is another pure function on the same input type.

3. **Ticker case normalization test:** Should Phase 1 include a test for mixed-case tickers (`"aapl"` + `"AAPL"` in the same user's transactions) to confirm they aggregate to one position? This would cover the normalization at line 98.
