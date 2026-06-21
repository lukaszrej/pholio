# Cash Position Tracking Implementation Plan

## Overview

Wire cash deposit/withdrawal tracking end-to-end so the existing **Cash Position** sidebar section in `PortfolioSection.tsx` (currently showing `—` because nothing feeds the `cashBalance` prop) displays real balances. Cash is recorded through the existing Add Transaction flow as a new transaction type, persisted in the existing `transactions` table via a `transaction_type` discriminator column, and is fully manageable (add / view / edit / delete).

## Current State Analysis

The app currently has **no concept of cash** — every `transactions` row is implicitly an equity buy (ticker, price, shares). The schema, Zod validator, TypeScript type, form, and compute functions all assume this.

Verified against current code:

- **`Transaction`** (`src/types/transaction.ts:5-16`) has no discriminator field.
- **`transactionSchema`** (`src/lib/transaction-schema.ts:5-19`) validates ticker/price/date/currency/shares/portfolio_id; no `transaction_type`.
- **API routes** spread `result.data` directly into insert (`src/pages/api/transactions/index.ts:64`) and update (`src/pages/api/transactions/[id].ts:73`). Once the schema gains `transaction_type` with a default, it flows through with **no manual route change**.
- **`computePositions`** (`src/lib/portfolio.ts:104-156`) groups every transaction by ticker — a `CASH` row would surface as a holdings row with `positionValue = null`. Must filter cash out before grouping.
- **`computeSectorAllocation`** (`src/lib/portfolio.ts:72-102`) already skips unpriced positions, so cash never enters sector math — but the holdings table still needs the filter.
- **`PortfolioSection`** (`src/components/portfolio/PortfolioSection.tsx:133,745-756`) already declares `cashBalance?: number | null` and renders Balance + % of Portfolio, displaying `—` when null. It appends `summary.currency` to the balance.
- **`DashboardView`** renders `PortfolioSection` (`src/components/transactions/DashboardView.tsx:615-635`) **without** passing `cashBalance`. It already builds `txByPortfolio` (`:259-267`), the perfect feed for per-portfolio cash.
- **`LotsModal`** (`src/components/transactions/LotsModal.tsx:15-18`) filters `transactions` by ticker and exposes `onEditRequest` / `onDeleteRequest`. Edit flows to `setEditingTransaction` → `AddTransactionForm` (`DashboardView.tsx:649,689-690`). A cash CRUD list reuses this entire path by passing `ticker="CASH"`.
- **Empty-state guard** (`PortfolioSection.tsx:234`) returns "No positions yet" whenever `transactions.length === 0`. Cash rows _are_ transactions, so a cash-only portfolio would pass this guard but render an empty holdings table — the guard must distinguish "no equity positions" from "no transactions at all".
- **Test infra** exists: `vitest`, with `src/lib/portfolio.test.ts` holding a `txn` fixture (`:25-35`) that will need the new field.

## Desired End State

A user can open Add Transaction, switch to **Cash**, choose Deposit or Withdrawal, enter an amount/date/currency, and save. The portfolio's Cash Position sidebar then shows the running balance (single-currency sum) and its % of total portfolio value. Cash rows never appear in the holdings table or sector chart. Clicking the Cash Position block opens a list of cash movements where each can be edited or deleted. A portfolio holding only cash still renders its layout with a populated Cash Position instead of the empty-state CTA.

**Verification:** Add a $1000 deposit and a $200 withdrawal to a portfolio → sidebar Balance shows `800.00 USD`; holdings table unaffected; clicking Cash Position lists both rows; editing the withdrawal to $300 updates Balance to `700.00`; deleting both restores `—` (or `0.00`).

### Key Discoveries:

- The `ticker="CASH"`, `shares=1`, `purchase_price=amount` encoding satisfies both DB `CHECK (... > 0)` constraints (`supabase/migrations/20260604111725_create_transactions.sql`) with **zero constraint migrations** — only an additive `transaction_type` column is needed.
- API routes require **no edits** — `result.data` already carries every validated field into insert/update.
- `txByPortfolio` (`DashboardView.tsx:259-267`) is already grouped by portfolio — `computeCashBalance` plugs straight in alongside `portfolioPositionsMap` (`:269-275`).
- The cash CRUD path reuses LotsModal + the existing edit/delete wiring verbatim by treating `"CASH"` as the ticker.

## What We're NOT Doing

- **Per-currency cash balances.** `computeCashBalance` returns a single `number` summing all cash rows; mixed-currency portfolios produce a meaningless total (acceptable — portfolios are effectively single-currency, and the sidebar already shows one Balance + `summary.currency`).
- **Negative-balance prevention.** Withdrawals are never blocked or warned; a negative balance renders as a negative number.
- **Cash in "All portfolios" view or the ticker-card grid** (`CardSection`). Out of scope — cash shows only in single-portfolio full mode.
- **Cash in the compact `PortfolioSection` mode** (currently unused in DashboardView).
- **Component/integration tests for the form or API.** Coverage is unit-level on the pure logic only.
- **Multi-currency conversion / FX rates.**

## Implementation Approach

Bottom-up: land the data model and pure logic first (independently testable), then the input path (form), then the read path (display + empty-state), then the management path (CRUD). Each phase is shippable and verifiable on its own. The discriminator-column design means no existing rows or constraints change, and the API layer is untouched.

## Critical Implementation Details

- **Migration ordering & fallback.** Until the `transaction_type` column lands and types regenerate, the cash filter in `computePositions` should guard on `t.transaction_type === "equity"`. Because the column is `NOT NULL DEFAULT 'equity'`, every existing and future equity row satisfies this. (A `t.ticker !== "CASH"` fallback is available but the discriminator is the canonical guard.)
- **Form value coupling.** In Cash mode the form must set `ticker="CASH"` and `shares=1` before submit so the Zod schema (which still requires positive `ticker`/`shares`) passes. The `ticker` transform already uppercases, so `"CASH"` round-trips cleanly.
- **Edit-mode detection.** `AddTransactionForm` receives a `transaction` prop on edit. It must derive initial mode from `transaction.transaction_type` (`"equity"` → Stock; `"cash_deposit"`/`"cash_withdrawal"` → Cash + corresponding Deposit/Withdrawal), so editing a cash row reopens in Cash mode.

## Phase 1: Data Foundation & Logic

### Overview

Add the `transaction_type` discriminator across DB, types, and validation; implement `computeCashBalance`; filter cash out of `computePositions`; cover both with unit tests.

### Changes Required:

#### 1. DB Migration

**File**: `supabase/migrations/<timestamp>_add_transaction_type.sql` (new; follow existing `YYYYMMDDHHMMSS_` naming, newest is `20260617120000`)

**Intent**: Add a non-null discriminator so cash rows can be distinguished from equity rows without touching existing constraints or data.

**Contract**: `ALTER TABLE public.transactions ADD COLUMN transaction_type TEXT NOT NULL DEFAULT 'equity' CHECK (transaction_type IN ('equity', 'cash_deposit', 'cash_withdrawal'));` No RLS policy changes (additive column on an existing table; existing policies cover it). No `WITH CHECK` concern — this migration adds no UPDATE policy.

#### 2. TypeScript Type

**File**: `src/types/transaction.ts`

**Intent**: Add the `transaction_type` field and a `TransactionType` union so the field is typed everywhere `Transaction` is consumed.

**Contract**: `export type TransactionType = "equity" | "cash_deposit" | "cash_withdrawal";` added to the `Transaction` interface as `transaction_type: TransactionType;`. Use double quotes (lint rule). `NewTransaction`/`UpdateTransaction` derive automatically via `Omit`/`Partial`.

#### 3. Zod Schema

**File**: `src/lib/transaction-schema.ts`

**Intent**: Validate `transaction_type` with a default so existing equity submissions (which omit it) remain valid and the API insert/update picks it up automatically.

**Contract**: Add `transaction_type: z.enum(["equity", "cash_deposit", "cash_withdrawal"]).default("equity")` to `transactionSchema`. `TransactionFormValues` (the `z.infer`) gains the field.

#### 4. computeCashBalance + cash filter

**File**: `src/lib/portfolio.ts`

**Intent**: Add a pure function that nets deposits minus withdrawals into a single number, and exclude cash rows from position grouping so they never appear as holdings.

**Contract**: `export function computeCashBalance(transactions: Transaction[]): number` — sums `purchase_price` for `cash_deposit`, subtracts for `cash_withdrawal`, ignores `equity`; returns `0` when no cash rows. In `computePositions`, filter to `t.transaction_type === "equity"` before the grouping loop (`:107`).

#### 5. Unit tests + fixture update

**File**: `src/lib/portfolio.test.ts`

**Intent**: Cover the new logic and keep the shared fixture type-correct.

**Contract**: Add `transaction_type: "equity"` to the `txn` fixture default (`:25-35`). New `describe("computeCashBalance")` cases: deposits-only sum, deposit+withdrawal net, withdrawal-exceeds-deposit (negative result), empty/no-cash returns 0. Add a case asserting `computePositions` excludes `cash_deposit`/`cash_withdrawal` rows from the returned positions.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests pass: `npm run test`

#### Manual Verification:

- Migration applies cleanly against a local/remote Supabase DB and existing rows show `transaction_type = 'equity'`.

**Implementation Note**: After completing this phase and automated verification passes, pause for manual confirmation that the migration applied before proceeding.

---

## Phase 2: Cash Entry in AddTransactionForm

### Overview

Add a Stock/Cash mode toggle to the transaction form. In Cash mode, collect Amount + Deposit/Withdrawal + Date + Currency, hide Ticker/Price/Shares, and set the cash sentinel fields before submit.

### Changes Required:

#### 1. Mode toggle + conditional fields

**File**: `src/components/transactions/AddTransactionForm.tsx`

**Intent**: Let the user choose between recording a stock transaction (existing behavior, unchanged) and a cash movement, reusing the same modal and submit pipeline.

**Contract**: Add local state for mode (`"stock" | "cash"`, default `"stock"`) rendered as a two-button toggle above the Portfolio field, and a Deposit/Withdrawal sub-toggle shown only in Cash mode.

- **Stock mode:** all six existing fields render unchanged.
- **Cash mode:** render Date (shared field, relabelled "Date"), the Deposit/Withdrawal toggle, Amount (number, `step="0.01"`, bound to the `purchase_price` field), and Currency; hide Ticker, Purchase Price label-as-"price", and Shares.
- **On submit in Cash mode:** set `ticker = "CASH"`, `shares = 1`, `transaction_type = isDeposit ? "cash_deposit" : "cash_withdrawal"` before the existing `fetch`. Stock mode sets `transaction_type = "equity"`.
- **Edit mode:** initialize mode and deposit/withdrawal from `transaction.transaction_type` (see Critical Implementation Details). Ticker stays hidden in Cash mode (it is always `"CASH"`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Toggling Stock/Cash swaps the field set; default is Stock with no behavior change for existing equity entry.
- Submitting a Cash deposit creates a row with `transaction_type="cash_deposit"`, `ticker="CASH"`, `shares=1`, `purchase_price=amount` (verify via DB or the Phase 3 sidebar).
- Submitting a Cash withdrawal records `cash_withdrawal`.
- Form validation errors render correctly in both modes.

**Implementation Note**: Pause for manual confirmation after this phase before proceeding.

---

## Phase 3: Display Wiring & Empty-State

### Overview

Feed real per-portfolio cash balances into `PortfolioSection`, and fix the empty-state so a cash-only portfolio renders its layout instead of the "No positions yet" CTA.

### Changes Required:

#### 1. Per-portfolio cash map + prop wiring

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Compute each portfolio's cash balance from the already-grouped transactions and pass it to the rendered section.

**Contract**: Import `computeCashBalance` from `@/lib/portfolio`. Add a `useMemo` building `portfolioCashMap: Map<string, number>` from `portfolios` + `txByPortfolio` (mirror `portfolioPositionsMap` at `:269-275`). Pass `cashBalance={portfolioCashMap.get(activePortfolio.id) ?? null}` to `<PortfolioSection>` (`:615`).

#### 2. Empty-state guard

**File**: `src/components/portfolio/PortfolioSection.tsx`

**Intent**: Treat a portfolio that has cash but no equity positions as non-empty, so its layout (with empty holdings + populated Cash Position) renders.

**Contract**: Change the early-return guard (`:234`) from `transactions.length === 0` to a condition meaning "no equity positions AND no cash" — i.e. `positions.length === 0 && (cashBalance == null || cashBalance === 0)`. (`positions` already excludes cash after Phase 1.) When equity positions exist the full/compact paths render as today; when only cash exists, the holdings table renders empty (or with its existing zero-row body) while the sidebar shows the balance. Note `positions` is computed at `:151`, after the guard — the guard must move below that `useMemo` or reference a recomputed value; keep the existing `useMemo` order and relocate the guard accordingly.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests pass: `npm run test`

#### Manual Verification:

- A portfolio with equity + cash shows the correct Balance and % of Portfolio in the sidebar.
- A portfolio with only cash renders the layout with an empty holdings area and a populated Cash Position (not "No positions yet").
- A portfolio with neither still shows "No positions yet".
- Balance currency suffix matches `summary.currency`; % of Portfolio matches `cash / (currentValue + cash)`.

**Implementation Note**: Pause for manual confirmation after this phase before proceeding.

---

## Phase 4: Cash CRUD via LotsModal

### Overview

Make the Cash Position block clickable to open a list of cash movements with edit/delete, reusing LotsModal and the existing edit/delete wiring by treating `"CASH"` as the ticker. Edit reopens `AddTransactionForm` in Cash mode.

### Changes Required:

#### 1. Clickable Cash Position

**File**: `src/components/portfolio/PortfolioSection.tsx`

**Intent**: Give users an entry point to view/manage cash movements, since cash rows never appear in the holdings table.

**Contract**: Make the Cash Position block (`:728-759`) clickable when `cashBalance != null`, calling `onShowLots("CASH", portfolio.id)` (reuse the existing `onShowLots` prop — no new prop needed). Add hover/cursor affordance consistent with holdings rows.

#### 2. Cash-aware LotsModal display

**File**: `src/components/transactions/LotsModal.tsx`

**Intent**: Present cash movements meaningfully rather than as Shares/Price lots.

**Contract**: When the filtered rows are cash (ticker `"CASH"` or rows where `transaction_type !== "equity"`), render title "Cash — Deposits & Withdrawals" and columns Date / Type (Deposit|Withdrawal from `transaction_type`) / Amount (`purchase_price`) / Currency, keeping the existing Edit/Delete buttons and `onEditRequest`/`onDeleteRequest` callbacks. Equity display path unchanged. The existing `transactions` filter (`:16-18`) already matches by ticker, so `"CASH"` selects all cash rows for the portfolio.

#### 3. Edit form opens in Cash mode

**File**: `src/components/transactions/AddTransactionForm.tsx` (covered by Phase 2's edit-mode detection)

**Intent**: Editing a cash row reopens the form in Cash mode with the right deposit/withdrawal selection.

**Contract**: Verify the Phase 2 edit-mode initialization (mode + deposit/withdrawal derived from `transaction.transaction_type`) works through the `setEditingTransaction` → `AddTransactionForm` path (`DashboardView.tsx:649,689-690`). No new wiring in `DashboardView` — `onEditRequest`/`onDeleteRequest` already route cash rows correctly.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Clicking the Cash Position block opens a modal listing all cash movements for the portfolio with Date/Type/Amount/Currency.
- Editing a cash row reopens the form in Cash mode with the correct Deposit/Withdrawal selection; saving updates the Balance.
- Deleting a cash row removes it and updates the Balance; deleting the last cash row returns the sidebar to `—`/`0.00` and re-applies the empty-state if no equity remains.
- Equity LotsModal behavior is unchanged.

**Implementation Note**: Final phase — confirm full add/view/edit/delete loop manually.

---

## Testing Strategy

### Unit Tests:

- `computeCashBalance`: deposits-only sum; deposit+withdrawal net; withdrawal exceeding deposits (negative); no cash rows → 0.
- `computePositions`: cash rows (`cash_deposit`/`cash_withdrawal`) excluded from returned positions; equity grouping unchanged.
- Shared `txn` fixture updated with `transaction_type: "equity"` default.

### Integration Tests:

- None added this change (API column flows through automatically; covered by existing transaction integration tests for the equity path).

### Manual Testing Steps:

1. Add a Cash deposit of 1000 USD → sidebar Balance shows `1,000.00 USD`.
2. Add a Cash withdrawal of 200 USD → Balance shows `800.00 USD`; holdings table unaffected.
3. Confirm CASH does not appear in the holdings table or sector chart.
4. Click Cash Position → both movements listed; edit withdrawal to 300 → Balance `700.00`.
5. Delete both → Balance returns to `—`/`0.00`; cash-only portfolio shows empty layout, then "No positions yet" only if no transactions remain.
6. Verify an existing equity-only portfolio is visually and behaviorally unchanged.

## Performance Considerations

Negligible. `computeCashBalance` is an O(n) reduce over a portfolio's transactions, memoized alongside the existing `portfolioPositionsMap`.

## Migration Notes

Additive, non-breaking: `transaction_type` defaults to `'equity'`, so all existing rows are backfilled automatically and no constraint changes are required. Rollback is `ALTER TABLE public.transactions DROP COLUMN transaction_type;` (only safe before any cash rows exist).

## References

- Related research: `context/changes/cash-position/research.md`
- Cash Position UI (already wired): `src/components/portfolio/PortfolioSection.tsx:728-759`
- Position grouping to filter: `src/lib/portfolio.ts:104-156`
- Per-portfolio tx map to feed cash: `src/components/transactions/DashboardView.tsx:259-275`
- Lots/edit/delete wiring to reuse: `src/components/transactions/LotsModal.tsx`, `DashboardView.tsx:642-693`
- Lessons applied: double quotes (L-quotes), Zod v4 `z.enum`, field-type checks for helper signatures, RLS `WITH CHECK` (n/a — no UPDATE policy added)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data Foundation & Logic

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — c031cb6
- [x] 1.2 Linting passes: `npm run lint` — c031cb6
- [x] 1.3 Unit tests pass: `npm run test` — c031cb6

#### Manual

- [x] 1.4 Migration applies cleanly; existing rows show `transaction_type = 'equity'` — c031cb6

### Phase 2: Cash Entry in AddTransactionForm

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — f544927
- [x] 2.2 Linting passes: `npm run lint` — f544927

#### Manual

- [x] 2.3 Stock/Cash toggle swaps field set; Stock default unchanged — f544927
- [x] 2.4 Cash deposit creates correct row (`cash_deposit`, `ticker="CASH"`, `shares=1`, `purchase_price=amount`) — f544927
- [x] 2.5 Cash withdrawal records `cash_withdrawal` — f544927
- [x] 2.6 Validation errors render in both modes — f544927

### Phase 3: Display Wiring & Empty-State

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck` — 354e549
- [x] 3.2 Linting passes: `npm run lint` — 354e549
- [x] 3.3 Unit tests pass: `npm run test` — 354e549

#### Manual

- [x] 3.4 Equity + cash portfolio shows correct Balance and % of Portfolio — 354e549
- [x] 3.5 Cash-only portfolio renders layout with empty holdings + populated Cash Position — 354e549
- [x] 3.6 Portfolio with neither shows "No positions yet" — 354e549
- [x] 3.7 Currency suffix and % math correct — 354e549

### Phase 4: Cash CRUD via LotsModal

#### Automated

- [x] 4.1 Type checking passes: `npm run typecheck` — a1e4fe6
- [x] 4.2 Linting passes: `npm run lint` — a1e4fe6

#### Manual

- [x] 4.3 Cash Position block opens modal listing cash movements (Date/Type/Amount/Currency) — a1e4fe6
- [x] 4.4 Editing a cash row reopens form in Cash mode; save updates Balance — a1e4fe6
- [x] 4.5 Deleting cash rows updates Balance and re-applies empty-state correctly — a1e4fe6
- [x] 4.6 Equity LotsModal behavior unchanged — a1e4fe6
