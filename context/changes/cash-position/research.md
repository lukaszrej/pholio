---
date: 2026-06-20T00:00:00+00:00
researcher: Claude Sonnet 4.6
git_commit: d1ad6f119eb164d48ca3e8f748765a3fa89cfb39
branch: main
repository: Pholio
topic: "How to add cash position tracking to the Pholio app"
tags: [research, cash, transactions, portfolio, supabase, forms]
status: complete
last_updated: 2026-06-20
last_updated_by: Claude Sonnet 4.6
---

# Research: Cash Position Tracking

**Date**: 2026-06-20  
**Git Commit**: d1ad6f119eb164d48ca3e8f748765a3fa89cfb39  
**Branch**: main  
**Repository**: Pholio

## Research Question

How to add cash deposit/withdrawal tracking so the existing Cash Position UI section in the sidebar (currently showing `—`) is populated with real data. The user wants cash to be recorded via the Add Transaction flow as a new transaction type.

## Summary

The current app has **no concept of cash** — every `Transaction` row represents an equity purchase (ticker, price, shares). The DB schema, Zod schema, TypeScript types, form, and compute functions all assume this. Adding cash tracking requires a **discriminator column (`transaction_type`)** on the existing `transactions` table, minor form changes (a Stock / Cash toggle in `AddTransactionForm`), a new `computeCashBalance()` function, and threaded prop plumbing through `DashboardView` to the already-wired `cashBalance` prop on `PortfolioSection`.

The key design insight: for cash transactions we can store `ticker = 'CASH'`, `shares = 1`, `purchase_price = amount` — this satisfies all existing DB `CHECK` constraints with zero constraint migrations and makes `costBasis = 1 × amount = amount` semantically correct. Only the discriminator column needs to be added.

---

## Detailed Findings

### 1. Current Transaction Model

**`src/types/transaction.ts`** — no type discriminator:

```typescript
export interface Transaction {
  id: string;
  user_id: string;
  ticker: string; // e.g. "AAPL" — would be "CASH" for cash rows
  purchase_price: number; // cost per share — would be cash amount
  purchase_date: string; // YYYY-MM-DD
  currency: Currency; // one of 11 supported currencies
  shares: number; // share count — would be 1 for cash rows
  portfolio_id: string;
  created_at: string;
  updated_at: string;
}
```

**`supabase/migrations/20260604111725_create_transactions.sql`** — DB constraints to be aware of:

- `purchase_price NUMERIC(15,4) NOT NULL CHECK (purchase_price > 0)` ← satisfied by cash amount > 0
- `shares NUMERIC(15,4) NOT NULL CHECK (shares > 0)` ← satisfied by setting `shares = 1`
- `currency TEXT NOT NULL CHECK (currency IN ('PLN','USD',…))` ← reused for cash currency

**No existing `transaction_type` column.** Every transaction is implicitly an equity buy.

### 2. Zod Validation Schema

**`src/lib/transaction-schema.ts`**:

```typescript
export const CURRENCIES = ["PLN", "USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "DKK", "NOK", "SEK"] as const;

export const transactionSchema = z.object({
  ticker: z
    .string()
    .min(1)
    .transform((v) => v.trim().toUpperCase()),
  purchase_price: z.coerce.number().positive(),
  purchase_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => !isNaN(Date.parse(v))),
  currency: z.enum(CURRENCIES),
  shares: z.coerce.number().positive(),
  portfolio_id: z.uuid({ message: "Invalid portfolio ID" }),
});
```

The schema must be extended with a `transaction_type` field and, for cash, the `ticker` and `shares` fields should be auto-filled server-side or client-side (not user-entered).

### 3. AddTransactionForm — Current Fields

**`src/components/transactions/AddTransactionForm.tsx`** renders (in order):

1. Portfolio (Select, `portfolio_id`)
2. Ticker (Text, disabled when editing)
3. Purchase Date (date input, `purchase_date`)
4. Purchase Price (number, step=0.0001, `purchase_price`)
5. Shares (number, step=0.0001, `shares`)
6. Currency (Select, defaults "USD")

The form POSTs to `/api/transactions` (create) or PUTs to `/api/transactions/{id}` (edit). Default currency is `"USD"`.

### 4. API Routes

**POST `/api/transactions`** (`src/pages/api/transactions/index.ts`):

```
auth check → JSON parse → transactionSchema.safeParse → portfolio ownership check → supabase insert
```

Inserts: `{ user_id, ticker, purchase_price, purchase_date, currency, shares, portfolio_id }`  
Returns: `201 { data: Transaction }`

**PUT `/api/transactions/[id]`** and **DELETE `/api/transactions/[id]`** follow the same pattern.  
The transactions API endpoints live at `src/pages/api/transactions/`.

### 5. computePositions — Cash Must Be Filtered Out

**`src/lib/portfolio.ts:104`** — `computePositions` groups by `ticker`:

```typescript
export function computePositions(transactions: Transaction[], prices: Record<string, PriceData>) {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const ticker = t.ticker.toUpperCase();
    // groups 'CASH' alongside 'AAPL', 'MSFT', etc.
    ...
  }
}
```

Without filtering, a `ticker = 'CASH'` row would appear in the positions table and ticker-tape. It has no price entry in the `prices` table so `positionValue` would be `null`, but it would still show up as a row in the UI. **Must filter before grouping.**

`computeSectorAllocation` (`src/lib/portfolio.ts:72`) only processes positions with `positionValue !== null`, so it would naturally exclude CASH — but `computePositions` must still exclude CASH rows to prevent them appearing in the holdings table.

### 6. cashBalance Prop — Already Wired in UI

**`src/components/portfolio/PortfolioSection.tsx`** (added in this session):

- `cashBalance?: number | null` prop, defaults to `null`
- Full-mode sidebar shows "Cash Position" section with Balance + % of Portfolio
- Both display `—` when `cashBalance` is `null`

**`src/components/transactions/DashboardView.tsx:614`** — `PortfolioSection` is rendered as:

```tsx
<PortfolioSection
  portfolio={activePortfolio}
  transactions={txByPortfolio.get(activePortfolio.id) ?? []}
  prices={prices}
  sectors={sectors}
  onAddTransaction={...}
  ...
  // cashBalance not yet passed — this is the missing wire
/>
```

### 7. Data Flow — Current vs. Target

**Current (broken):**

```
DB transactions (equity only)
  → /dashboard page fetch
  → DashboardView state
  → PortfolioSection (cashBalance=undefined → shows "—")
```

**Target:**

```
DB transactions (equity + cash_deposit + cash_withdrawal rows)
  → /dashboard page fetch (no change needed — all transactions fetched)
  → DashboardView.txByPortfolio (already groups by portfolio_id)
  → computeCashBalance(txByPortfolio.get(id)) → single number
  → PortfolioSection cashBalance={cashBalance} → sidebar shows real values
```

---

## Recommended Implementation — 7 Layers

### Layer 1: DB Migration

Add `transaction_type` column with a safe default. No constraint changes needed.

```sql
-- supabase/migrations/<timestamp>_add_transaction_type.sql
ALTER TABLE public.transactions
  ADD COLUMN transaction_type TEXT NOT NULL DEFAULT 'equity'
    CHECK (transaction_type IN ('equity', 'cash_deposit', 'cash_withdrawal'));
```

Cash rows will use:

- `transaction_type`: `'cash_deposit'` or `'cash_withdrawal'`
- `ticker`: `'CASH'` (sentinel — uppercased by schema transform, never a real stock)
- `shares`: `1` (satisfies the `shares > 0` DB check; makes `costBasis = amount × 1 = amount`)
- `purchase_price`: the cash amount (satisfies `purchase_price > 0`)
- `currency`: the cash currency

No existing rows are affected (`DEFAULT 'equity'`). No CHECK constraint changes needed.

### Layer 2: TypeScript Types (`src/types/transaction.ts`)

```typescript
export type TransactionType = "equity" | "cash_deposit" | "cash_withdrawal";

export interface Transaction {
  // ... existing fields unchanged ...
  transaction_type: TransactionType; // add this
}
```

### Layer 3: Zod Schema (`src/lib/transaction-schema.ts`)

Extend `transactionSchema` with the new field:

```typescript
export const transactionSchema = z.object({
  // ... existing fields unchanged ...
  transaction_type: z.enum(["equity", "cash_deposit", "cash_withdrawal"]).default("equity"),
});
```

The form will send `transaction_type` explicitly. For cash transactions the form also sends `ticker = "CASH"` and `shares = 1` — these can be fixed server-side in the API route or set by the form before submit. Simplest: set them in the form's submit handler.

### Layer 4: AddTransactionForm (`src/components/transactions/AddTransactionForm.tsx`)

Add a **transaction type toggle** as the first control, above Portfolio:

```
[ Stock ]  [ Cash ]    ← two-button toggle, default: Stock
```

**When "Stock" is selected:** show existing fields unchanged.

**When "Cash" is selected:** replace Ticker, Purchase Price, and Shares with:

- Amount (number input, step=0.01, `purchase_price` field)
- Type (radio/toggle: "Deposit" / "Withdrawal" → maps to `transaction_type`)
- Date and Currency remain the same

On submit for cash:

```typescript
// client sets these before submit:
setValue("ticker", "CASH");
setValue("shares", 1);
setValue("transaction_type", isDeposit ? "cash_deposit" : "cash_withdrawal");
// purchase_price = amount entered by user
```

The `ticker` field is disabled when editing — for cash transactions it should simply not be shown (it's always 'CASH').

### Layer 5: lib/portfolio.ts — New Function + Filter

**Add `computeCashBalance`:**

```typescript
export function computeCashBalance(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.transaction_type === "cash_deposit" || t.transaction_type === "cash_withdrawal")
    .reduce((sum, t) => {
      return t.transaction_type === "cash_deposit"
        ? sum + t.purchase_price // purchase_price = amount
        : sum - t.purchase_price;
    }, 0);
}
```

**Filter cash out of `computePositions`** (`src/lib/portfolio.ts:104`):

```typescript
export function computePositions(transactions: Transaction[], prices: Record<string, PriceData>) {
  const equityOnly = transactions.filter(t => t.transaction_type === "equity");
  // then use equityOnly instead of transactions in the rest of the function
  ...
}
```

(Until `transaction_type` lands in the DB, the filter can also guard on `t.ticker !== "CASH"` as a fallback.)

### Layer 6: DashboardView (`src/components/transactions/DashboardView.tsx`)

Import `computeCashBalance` and compute per-portfolio:

```typescript
import { computePositions, computePortfolioSummary, computeCashBalance, ... } from "@/lib/portfolio";

// inside the component, alongside portfolioPositionsMap:
const portfolioCashMap = useMemo(() => {
  const map = new Map<string, number>();
  for (const p of portfolios) {
    map.set(p.id, computeCashBalance(txByPortfolio.get(p.id) ?? []));
  }
  return map;
}, [portfolios, txByPortfolio]);

// pass to PortfolioSection:
<PortfolioSection
  ...
  cashBalance={portfolioCashMap.get(activePortfolio.id) ?? null}
/>
```

### Layer 7: LotsModal (`src/components/transactions/LotsModal.tsx`)

The LotsModal filters by `ticker` (case-insensitive). If user clicks on a hypothetical "CASH" lot row it would open LotsModal for `ticker = "CASH"`. Since cash transactions won't appear in the holdings table (filtered in `computePositions`), this is a non-issue. But to be safe, the LotsModal's edit/delete actions should also be aware that `transaction_type !== 'equity'` rows shouldn't be editable as equity. The edit form would need to open in "cash" mode.

---

## Architecture Insights

**Why `ticker = 'CASH'` + `shares = 1` works:**

- Satisfies both `> 0` DB constraints without migration changes
- `costBasis = purchase_price × shares = amount × 1 = amount` — semantically correct
- Excluded from sector allocation naturally (no price in `prices` table → `positionValue = null`)
- `'CASH'` cannot collide with real stock tickers (it's not listed on any exchange)

**Why NOT a separate table:**

- All existing infrastructure (RLS, API, `txByPortfolio` map, pagination, the form) already handles the `transactions` table
- A separate `cash_transactions` table doubles the surface area for no gain

**Why NOT a column on `portfolios`:**

- Loses transaction history (when was each deposit made, in what currency?)
- The design shows a Balance field — that's a computed value from history, not a stored scalar
- `portfolios` has `ON DELETE RESTRICT` on transactions, so a cash_balance column there would still need history somewhere

**Multi-currency cash:**
The `computeCashBalance` function as written sums across currencies (dollar + zloty → meaningless number). A more correct version groups by currency. For now, keeping it simple (single-currency portfolios) and adding a `currency` parameter later is the right call. The UI already shows `—` when `summary.currency` is `null` (multi-currency).

---

## Code References

- `src/types/transaction.ts:1-18` — Transaction interface, no `transaction_type` field
- `src/lib/transaction-schema.ts:1-20` — Zod schema + CURRENCIES constant
- `src/lib/portfolio.ts:104-156` — `computePositions` groups by ticker (must filter CASH)
- `src/lib/portfolio.ts:72-102` — `computeSectorAllocation` (naturally skips unpriced tickers)
- `src/components/transactions/AddTransactionForm.tsx` — 6-field form, needs stock/cash toggle
- `src/components/transactions/DashboardView.tsx:259-284` — `txByPortfolio` map (can feed `computeCashBalance`)
- `src/components/transactions/DashboardView.tsx:614-635` — `PortfolioSection` render (add `cashBalance` prop)
- `src/components/portfolio/PortfolioSection.tsx:123-145` — `cashBalance` prop already declared and rendered
- `src/pages/api/transactions/index.ts` — POST handler (needs `transaction_type` in insert)
- `src/pages/api/transactions/[id].ts` — PUT/DELETE handlers
- `supabase/migrations/20260604111725_create_transactions.sql` — DB schema (`shares > 0`, `purchase_price > 0` constraints)

## Historical Context

No prior cash-tracking changes found in `context/changes/` or `context/archive/`.  
The `watchlist-skeleton-height` change in `context/changes/` is unrelated.

## Open Questions

1. **Multi-currency cash**: Should `computeCashBalance` return `number` (single-currency sum) or `Map<Currency, number>` (per-currency)? The sidebar currently shows one Balance value — start with single-currency and add multi-currency support when needed.
2. **Negative balance UI**: Should a withdrawal that exceeds the deposited balance be allowed? No DB-level enforcement is proposed; the UI could warn but not block.
3. **Editing cash transactions**: Should the LotsModal support editing cash rows? Initial implementation can exclude them (cash rows don't appear in holdings table).
4. **Cash in "All portfolios" / Dashboard tab**: The `PortfolioSection` compact mode (currently unused in DashboardView) and the ticker-card grid don't show cash. Out of scope for this change.
