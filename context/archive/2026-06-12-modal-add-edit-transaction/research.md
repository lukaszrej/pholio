---
date: 2026-06-12T00:00:00+02:00
researcher: Claude Sonnet 4.6
git_commit: 5346d70693b48e55b0262465afde1837ce838bdb
branch: main
repository: Pholio
topic: "Modal add/edit transaction — move ticker transaction sub-table from inline expansion to modal"
tags: [research, transactions, modal, DashboardView, AddTransactionForm, dialog]
status: complete
last_updated: 2026-06-12
last_updated_by: Claude Sonnet 4.6
---

# Research: Modal Add/Edit Transaction

**Date**: 2026-06-12  
**Researcher**: Claude Sonnet 4.6  
**Git Commit**: 5346d70693b48e55b0262465afde1837ce838bdb  
**Branch**: main  
**Repository**: Pholio

## Research Question

Move the per-ticker transaction sub-table (showing Date, Shares, Price, Currency + Edit/Delete buttons) from an inline row-expansion pattern to a modal dialog, so the user no longer gets a new row appearing inline within the main portfolio table.

## Summary

**The change is narrower than it first appears.** The add and edit _forms_ already live in Dialog modals (`DashboardView.tsx:277–310`). What the user wants to move is the **discovery surface**: the inline sub-table that appears when a ticker row is expanded. Currently clicking a position row toggles `expandedTickers` state, which renders a nested `<table>` inline below that row (lines 195–248 of `DashboardView.tsx`). The goal is to replace this expansion with a modal that presents the same transaction list — and hosts the same Edit/Delete triggers — without breaking the add flow.

All infrastructure needed is already present: `Dialog` and `AlertDialog` from `src/components/ui/dialog.tsx` and `alert-dialog.tsx` (Radix UI), `AddTransactionForm` for add/edit, and a clean `useState`-based modal state pattern in `DashboardView`.

The main design decision is **nested modal depth**: the new "transactions for this ticker" modal would, on Edit or Delete, open a second Dialog/AlertDialog on top of itself. Radix UI handles stacked portals correctly so this is safe, but the pattern needs explicit state management for two layers.

---

## Detailed Findings

### The Inline Sub-Table Being Replaced

`src/components/transactions/DashboardView.tsx:195–248`

When `expandedTickers` contains a ticker symbol, the main portfolio table renders an extra `<tr>` with a nested `<table>` inside it:

| Column header   | Data source                    | Notes                                |
| --------------- | ------------------------------ | ------------------------------------ |
| Date            | `t.purchase_date`              | Displayed as-is (`YYYY-MM-DD`)       |
| Shares          | `formatShares(t.shares)`       | Smart formatting helper              |
| Price           | `t.purchase_price.toFixed(2)`  | 2 dp, no label                       |
| Currency        | `t.currency`                   | Plain text                           |
| (Edit button)   | `Button ghost sm`              | `onClick: setEditingTransaction(t)`  |
| (Delete button) | `Button ghost sm text-red-600` | `onClick: setDeletingTransaction(t)` |

The row expansion is toggled somewhere in the main ticker row (where `expandedTickers` is updated) — the exact click handler line needs to be confirmed at planning time.

### Existing Modal State in DashboardView

`src/components/transactions/DashboardView.tsx:54–63`

```ts
const [isDialogOpen, setIsDialogOpen]               = useState(false);          // Add form modal
const [expandedTickers, setExpandedTickers]           = useState<Set<string>>(…); // Inline expansion ← this is what changes
const [editingTransaction, setEditingTransaction]     = useState<Transaction | null>(null); // Edit form modal
const [deletingTransaction, setDeletingTransaction]   = useState<Transaction | null>(null); // Delete confirmation modal
const [isDeleteLoading, setIsDeleteLoading]           = useState(false);
const [deleteError, setDeleteError]                   = useState<string | null>(null);
```

After the change, `expandedTickers` becomes either `selectedTicker` (a single ticker string for which the new modal is open) or gets replaced by a similar state variable.

### Add Transaction Dialog (unchanged)

`src/components/transactions/DashboardView.tsx:277–289`

```tsx
<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Add transaction</DialogTitle>
    </DialogHeader>
    <AddTransactionForm onSuccess={handleAddSuccess} onCancel={() => setIsDialogOpen(false)} />
  </DialogContent>
</Dialog>
```

This modal already exists and does not need to move. The "Add transaction" button in the toolbar (line 259–268) already opens this.

### Edit Transaction Dialog (unchanged structure, trigger moves)

`src/components/transactions/DashboardView.tsx:292–310`

```tsx
<Dialog
  open={editingTransaction !== null}
  onOpenChange={(open) => {
    if (!open) setEditingTransaction(null);
  }}
>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Edit transaction</DialogTitle>
    </DialogHeader>
    <AddTransactionForm
      transaction={editingTransaction ?? undefined}
      onSuccess={handleEditSuccess}
      onCancel={() => setEditingTransaction(null)}
    />
  </DialogContent>
</Dialog>
```

The dialog itself does not change. Only the _trigger_ (the Edit button) moves from the inline sub-table into the new ticker-transactions modal.

### Delete Confirmation Dialog (unchanged structure, trigger moves)

`src/components/transactions/DashboardView.tsx:313–340` — same situation: AlertDialog stays, trigger button moves into the new modal.

### AddTransactionForm Component

`src/components/transactions/AddTransactionForm.tsx:1–195`

A single component handles both add and edit via optional `transaction` prop:

- No `transaction` prop → POST `/api/transactions`, button label "Add transaction"
- `transaction` prop present → PUT `/api/transactions/{id}`, button label "Save changes", ticker field disabled

Fields: `ticker` | `purchase_date` | `purchase_price` | `shares` | `currency` (Select)  
Validation: Zod schema in `src/lib/transaction-schema.ts`  
On success: calls `onSuccess(transaction)` callback — caller updates React state  
On error: sets `root` error displayed in a red banner, plus field-level inline errors

### Dialog Component Infrastructure

`src/components/ui/dialog.tsx:1–136`

- `Dialog` accepts `open` + `onOpenChange` (controlled mode)
- `DialogContent` has `showCloseButton` prop (default `true`)
- Max width: `sm:max-w-lg`
- Animations: fade + zoom via Tailwind data-attribute selectors
- Radix UI portal — renders outside the triggering DOM tree, safe to nest

`src/components/ui/alert-dialog.tsx:1–161`

- `AlertDialogContent` has a `size` prop (`"default"` | `"sm"`)
- Has `AlertDialogAction` and `AlertDialogCancel` slots
- Separate from `Dialog` — requires its own portal

### API Routes

| Method | Route                    | File                                        | Purpose                                          |
| ------ | ------------------------ | ------------------------------------------- | ------------------------------------------------ |
| POST   | `/api/transactions`      | `src/pages/api/transactions/index.ts:8–65`  | Create; returns `{ data: Transaction }` HTTP 201 |
| PUT    | `/api/transactions/[id]` | `src/pages/api/transactions/[id].ts:9–79`   | Update; returns `{ data: Transaction }` HTTP 200 |
| DELETE | `/api/transactions/[id]` | `src/pages/api/transactions/[id].ts:81–131` | Delete; returns `{ success: true }` HTTP 200     |

All three validate via `transactionSchema.safeParse`. Auth enforced both by middleware `/api/` guard and `context.locals.user` check inside each route. RLS enforces ownership at the DB layer.

### Transaction Type and Schema

`src/types/transaction.ts`

```ts
interface Transaction {
  id: string; // UUID
  user_id: string;
  ticker: string;
  purchase_price: number;
  purchase_date: string; // YYYY-MM-DD
  currency: Currency; // "PLN" | "USD" | "EUR" | ...
  shares: number;
  created_at: string;
  updated_at: string;
}
```

`src/lib/transaction-schema.ts` — Zod schema used by both form (client) and API routes (server)

---

## Architecture Insights

### Nested modal pattern is safe with Radix

Radix Dialog uses portals rendered to `document.body`. A Dialog opened from inside another Dialog's content mounts its own portal at the same level — not nested in the DOM. Focus management, scroll-lock, and z-index all work correctly. The existing `z-50` on overlays means the second Dialog overlay will visually layer on top. No custom z-index wrangling is needed.

### State shape decision for the new ticker-transactions modal

Two valid options:

**Option A — add a single new state variable:**

```ts
const [tickerModalTicker, setTickerModalTicker] = useState<string | null>(null);
```

`expandedTickers` state is removed; click handler becomes `setTickerModalTicker(ticker)`.

**Option B — extract a dedicated component:**
Create `TickerTransactionsModal.tsx` that owns the modal open state internally, triggered by a `trigger` prop or rendered imperatively. Keeps `DashboardView` slimmer.

Option A is simpler and consistent with the existing modal state pattern in the file. Option B is cleaner long-term if more features are added per-ticker. The plan should decide.

### The "Add transaction" button placement

Currently the "Add transaction" button lives in the DashboardView toolbar (lines 259–268), global to all tickers. In the new UX, the more natural placement would be inside the new ticker-transactions modal (scoped to that ticker, with `ticker` pre-filled). This changes `AddTransactionForm` usage: the new modal would pass a default ticker value. Since `ticker` is controlled by `react-hook-form` with `defaultValues`, passing it through the `transaction` prop is not possible (the prop represents an existing transaction). A new `defaultTicker` prop on `AddTransactionForm` (or a separate `defaultValues` prop) would be needed.

Alternatively, the global "Add transaction" button can stay where it is, and the ticker-transactions modal is purely a read/edit/delete surface. This is simpler and avoids `AddTransactionForm` changes.

### No revalidation strategy needed

The app uses React state as the source of truth after SSR load. All CRUD operations update the `transactions` array in `DashboardView` state directly via callbacks (`handleAddSuccess`, `handleEditSuccess`, `handleDeleteConfirm`). This pattern continues unchanged — the new modal simply moves where those callbacks are triggered from.

---

## Code References

- `src/components/transactions/DashboardView.tsx:54–63` — modal/expansion state variables
- `src/components/transactions/DashboardView.tsx:195–248` — inline sub-table (the thing being replaced)
- `src/components/transactions/DashboardView.tsx:259–268` — "Add transaction" toolbar button
- `src/components/transactions/DashboardView.tsx:277–289` — Add Transaction Dialog
- `src/components/transactions/DashboardView.tsx:292–310` — Edit Transaction Dialog
- `src/components/transactions/DashboardView.tsx:313–340` — Delete AlertDialog
- `src/components/transactions/AddTransactionForm.tsx:1–195` — shared add/edit form
- `src/components/ui/dialog.tsx:1–136` — Dialog component (Radix UI)
- `src/components/ui/alert-dialog.tsx:1–161` — AlertDialog component (Radix UI)
- `src/lib/transaction-schema.ts` — Zod validation schema
- `src/types/transaction.ts` — Transaction TypeScript interface
- `src/pages/api/transactions/index.ts:8–65` — POST create route
- `src/pages/api/transactions/[id].ts:9–79` — PUT update route
- `src/pages/api/transactions/[id].ts:81–131` — DELETE route

---

## Historical Context (from prior changes)

- `context/archive/2026-06-06-add-transaction/plan.md` — Modal was the only UX pattern ever considered for add; a separate `/transactions/add` page was raised in research but overridden by the plan. Inline row editing was never mentioned.
- `context/archive/2026-06-10-transaction-crud/plan-brief.md` — Edit was always modal-based. Expandable rows were chosen as the discovery surface ("Compact, shows grouping naturally, no page structure change"). Inline editing was never proposed.
- `context/archive/2026-06-10-transaction-crud/plan-brief.md` — Ticker is **disabled in edit mode** by design ("Prevents silent ticker reassignment; wrong ticker requires delete + re-add"). This constraint carries forward unchanged.
- `context/archive/2026-06-10-transaction-crud/plan-brief.md` — Delete is **not optimistic**: loading state shown on confirm button until API responds. This pattern carries forward into the new modal.

---

## Related Research

No prior research artifact exists for this change yet (this is the first).

Adjacent: `context/archive/2026-06-10-transaction-crud/` is the closest prior slice — all patterns for editing and deleting were established there.

---

## Open Questions

1. **State shape**: Add a `tickerModalTicker: string | null` state variable to `DashboardView`, or extract a `TickerTransactionsModal` component? Option A is simpler; Option B is cleaner if per-ticker features grow.

2. **"Add transaction" button placement**: Keep global toolbar button (simple, no `AddTransactionForm` changes) or move it into the ticker-transactions modal with ticker pre-filled (requires new `defaultTicker` prop or similar)? Plan should decide and scope accordingly.

3. **Remove `expandedTickers` entirely or keep it?** If the ticker click now opens a modal, the `Set<string>` expansion state and all its toggle logic can be deleted. Verify nothing else reads `expandedTickers` before removing.

4. **Modal title and content layout**: Should the modal show the ticker symbol in the title ("AAPL — Transactions")? What happens for a ticker with many transactions — does the modal scroll, or is there a max-height?

5. **Empty state**: If a ticker has zero transactions (edge case — can it happen?), what does the modal show?
