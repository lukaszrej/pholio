# Transaction CRUD (Edit + Delete) — Implementation Plan

## Overview

Add edit and delete capabilities for individual stock purchase transactions. The dashboard portfolio table gains expandable ticker rows: clicking a position row reveals its constituent individual transactions, each with Edit and Delete action buttons. Edit opens a pre-filled form dialog (ticker locked); Delete opens an AlertDialog confirmation. Both mutations update React state on success without a page refetch.

## Current State Analysis

- `DashboardView.tsx` renders a portfolio table of **aggregated positions** (by ticker via `computePositions`) — individual transactions are in `transactions[]` state but not shown row-by-row.
- `AddTransactionForm.tsx` — react-hook-form + zod + shadcn, only handles POST to `/api/transactions`; no edit mode.
- `/api/transactions/index.ts` — POST only; no PUT or DELETE handlers exist.
- `src/types/transaction.ts` — `Transaction`, `UpdateTransaction = Partial<NewTransaction>` already defined; no changes needed.
- `src/lib/transaction-schema.ts` — `transactionSchema` covers all 5 fields; reusable for server-side PUT validation.
- `src/components/ui/` — Dialog, Input, Label, Select all installed; **AlertDialog not yet installed**.
- RLS on `transactions` table (from F-01) enforces user isolation at the database level — `DELETE/UPDATE` queries are automatically scoped to the authenticated user's rows.

## Desired End State

- Clicking a position row in the portfolio table expands it, showing a sub-list of individual transactions for that ticker.
- Each transaction row shows: date, shares, price, currency, and Edit / Delete buttons.
- Edit: opens a dialog with all fields pre-filled; ticker is displayed but locked (read-only); submitting calls `PUT /api/transactions/{id}` and replaces the transaction in local state on success.
- Delete: opens an AlertDialog with a brief description; confirming calls `DELETE /api/transactions/{id}` and removes the transaction from local state on success. If deleting the last transaction for a ticker, the position row disappears automatically.

### Verify:

1. `npx astro check` passes with zero type errors
2. `npm run lint` passes
3. Clicking a position row expands it to show individual transactions
4. Edit dialog pre-fills all fields; ticker field is disabled
5. Saving a valid edit replaces the row in the dashboard without page reload
6. Delete confirmation dialog appears; confirming removes the row
7. Deleting the last transaction for a ticker removes the position row
8. Authenticated PUT/DELETE to a transaction owned by a different user returns 404 (RLS blocks it)
9. Unauthenticated PUT/DELETE returns 401

### Key Discoveries:

- `computePositions(transactions, prices)` re-derives positions from the `transactions` array — removing a transaction from that array and calling `useMemo` re-compute is all that's needed for the position row to disappear. No special handling required.
- `useForm defaultValues` in react-hook-form: passing `defaultValues` from an existing `Transaction` pre-fills all fields. A disabled HTML input does NOT clear RHF state — `values.ticker` will still be the pre-filled value on submit, so the same `transactionSchema` can validate the full body.
- Supabase RLS: `DELETE FROM transactions WHERE id = $1` is automatically filtered to `WHERE user_id = auth.uid() AND id = $1`. No explicit ownership check in application code needed; a missing row returns 0 rows affected (not an auth error), so the API should return 404 in that case.
- The current table has 7 columns. The expandable row needs `colSpan={8}` — add a narrow 8th column to the `<thead>` for the expand chevron indicator.

## What We're NOT Doing

- No ticker editing in edit mode — ticker is locked per the planning decision; changing ticker requires delete + re-add.
- No soft delete / undo — hard delete with confirmation per PRD §FR-006.
- No history of deleted transactions — out of scope for MVP per PRD §Non-Goals.
- No pagination of the sub-transaction list — MVP portfolio is small.
- No batch delete — one transaction at a time.
- No currency conversion — FR-009 is parked.

## Implementation Approach

Four sequential phases. Phase 1 installs the one missing UI primitive (AlertDialog). Phase 2 adds the server-side API. Phase 3 extends the form component. Phase 4 wires the full UX into DashboardView. Each phase is independently verifiable.

## Critical Implementation Details

**Ticker field in edit mode** — React Hook Form tracks `ticker` in its internal state even when the HTML input is `disabled`. The pre-filled value is submitted normally. Do NOT remove `register("ticker")` in edit mode; keep the input registered but add the `disabled` HTML attribute. The same `transactionSchema` validates the full PUT body server-side.

**expandedTickers state** — Use `useState<Set<string>>` with a functional updater that creates a new Set on each toggle (React requires a new reference to trigger re-render): `setExpandedTickers(prev => { const next = new Set(prev); next.has(t) ? next.delete(t) : next.add(t); return next; })`.

**Delete flow** — Do not do an optimistic remove before the API responds. Show a loading state on the AlertDialog confirm button while the fetch is in flight, then remove from state on success. If the fetch fails, leave the dialog open and show the error. This avoids rollback complexity and is acceptable given the modal blocks interaction.

---

## Phase 1: AlertDialog component

### Overview

Install the one shadcn component not yet in the project. No application behaviour changes.

### Changes Required:

#### 1. Install AlertDialog

**Command**: `npx shadcn add alert-dialog`

**Intent**: Add the `alert-dialog.tsx` primitive to `src/components/ui/`. The delete confirmation dialog in Phase 4 depends on it.

**Contract**: After install, `src/components/ui/alert-dialog.tsx` must exist and export `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`, `AlertDialogCancel`.

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes with zero errors
- `npm run build` succeeds
- `npm run lint` passes

#### Manual Verification:

- `src/components/ui/alert-dialog.tsx` exists

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: PUT + DELETE `/api/transactions/[id].ts`

### Overview

Create the API route that handles editing and deleting a single transaction by ID. Both methods enforce authentication and rely on RLS for ownership.

### Changes Required:

#### 1. Create dynamic transaction API route

**File**: `src/pages/api/transactions/[id].ts` _(new file)_

**Intent**: Handle PUT (edit) and DELETE (delete) for a single transaction. Both methods guard against unauthenticated requests, validate input (PUT only), perform the database operation, and return an appropriate response.

**Contract**:

`PUT` handler — steps in order:

1. Check `context.locals.user` — if null, return 401 `{ error: "Unauthorized" }`.
2. Extract `id` from `context.params.id`.
3. Parse body: `await context.request.json()` — if throws, return 400 `{ error: "Invalid JSON body" }`.
4. Validate with `transactionSchema.safeParse(body)` — if invalid, return 400 `{ error: result.error.issues[0].message }`.
5. Create Supabase client; if null, return 500 `{ error: "Service unavailable" }`.
6. Run: `supabase.from("transactions").update(result.data).eq("id", id).select().single()`.
7. If `error`, log and return 500 `{ error: "Internal server error" }`.
8. If `data` is null (row not found / RLS blocked), return 404 `{ error: "Transaction not found" }`.
9. Return 200 `{ data: updatedRow }`.

`DELETE` handler — steps in order:

1. Check `context.locals.user` — if null, return 401 `{ error: "Unauthorized" }`.
2. Extract `id` from `context.params.id`.
3. Create Supabase client; if null, return 500 `{ error: "Service unavailable" }`.
4. Run: `supabase.from("transactions").delete().eq("id", id).select("id").single()`.
5. If Supabase returns an error, return 500.
6. If `data` is null (row not found / RLS blocked), return 404 `{ error: "Transaction not found" }`.
7. Return 200 `{ success: true }`.

All responses must set `Content-Type: application/json`.

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes
- `npm run lint` passes

#### Manual Verification:

- Authenticated PUT with valid body on own transaction → 200 with updated row
- Authenticated DELETE on own transaction → 200 `{ success: true }`
- Unauthenticated PUT/DELETE → 401
- PUT with invalid body (e.g., negative price) → 400 with descriptive message
- DELETE on a non-existent or other user's transaction → 404

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 3: AddTransactionForm edit mode

### Overview

Extend the existing `AddTransactionForm` to support edit mode: pre-fill all fields from an existing transaction, lock the ticker field, and submit a PUT request instead of POST.

### Changes Required:

#### 1. Extend AddTransactionForm component

**File**: `src/components/transactions/AddTransactionForm.tsx` _(modify existing)_

**Intent**: Add an optional `transaction` prop. When present, the form operates in edit mode — `defaultValues` are populated from the transaction, the ticker input is disabled, and the submit handler calls PUT to `/api/transactions/{transaction.id}` instead of POST to `/api/transactions`. The `onSuccess` callback receives the updated (or newly created) `Transaction` in both modes.

**Contract**:

Props interface change:

```ts
interface Props {
  onSuccess: (transaction: Transaction) => void;
  onCancel: () => void;
  transaction?: Transaction;
}
```

`defaultValues` change: when `transaction` is provided, initialize all five fields from it (`ticker`, `purchase_date`, `purchase_price` as string (`.toString()`), `currency`, `shares` as string).

Ticker field: add `disabled={!!transaction}` to the `<Input id="ticker" ...>` element. The `register("ticker")` call stays — RHF still tracks the value for submission.

Submit handler: when `transaction` is defined, call `PUT /api/transactions/${transaction.id}`; otherwise call `POST /api/transactions`. Response parsing is identical in both modes.

Submit button label: `transaction ? "Save changes" : "Add transaction"`.
Submit button loading label: `transaction ? "Saving..." : "Adding..."`.

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes
- `npm run lint` passes

#### Manual Verification:

- Opening the form in edit mode shows all fields pre-filled
- Ticker field is visually disabled and cannot be typed into
- Submitting the edit form calls PUT (visible in DevTools Network tab)
- Add mode still works as before (POST, all fields editable)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 4: DashboardView — expandable rows + edit/delete UX

### Overview

Add expandable position rows to the portfolio table. Clicking a position row toggles a sub-section listing that ticker's individual transactions, each with Edit and Delete buttons. Edit opens a dialog using the extended `AddTransactionForm` in edit mode; Delete opens an `AlertDialog`. Both mutations update `transactions` state on success, causing `positions` to recompute via `useMemo`.

### Changes Required:

#### 1. Update DashboardView component

**File**: `src/components/transactions/DashboardView.tsx` _(modify existing)_

**Intent**: Add interactive row expansion, edit dialog, and delete confirmation to the dashboard. All transaction mutations (add, edit, delete) update the same `transactions` state; `positions` is derived automatically.

**Contract**:

New state variables:

- `expandedTickers: Set<string>` — which position rows are expanded; use `useState<Set<string>>(new Set())`
- `editingTransaction: Transaction | null` — non-null means the edit dialog is open for this transaction
- `deletingTransaction: Transaction | null` — non-null means the AlertDialog is open for this transaction
- `isDeleteLoading: boolean` — true while the DELETE fetch is in flight

New imports: `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, `AlertDialogTitle` from `@/components/ui/alert-dialog`; `ChevronDown`, `ChevronRight` from `lucide-react`.

**Portfolio table changes** — add an 8th column:

- `<thead>` gains a new `<th>` (empty or with an expand icon, narrow, e.g. `w-8`) as the last column.
- Each `<tr>` for a position gains `onClick={() => toggleExpanded(pos.ticker)}` and `className="... cursor-pointer"`.
- Last `<td>` in each position row: `<ChevronDown>` if expanded, `<ChevronRight>` if collapsed (both `size-4 text-blue-100/40`).
- After each position `<tr>`, conditionally render an expanded row:
  ```
  {expandedTickers.has(pos.ticker) && (
    <tr key={`${pos.ticker}-txns`}>
      <td colSpan={8} className="bg-white/3 px-6 pb-3 pt-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-blue-100/40">
              <th>Date</th><th>Shares</th><th>Price</th><th>Currency</th><th></th><th></th>
            </tr>
          </thead>
          <tbody>
            {transactions
              .filter(t => t.ticker.toUpperCase() === pos.ticker)
              .sort((a, b) => a.purchase_date.localeCompare(b.purchase_date))
              .map(t => (
                <tr key={t.id}>
                  <td>{t.purchase_date}</td>
                  <td>{t.shares.toFixed(4)}</td>
                  <td>{t.purchase_price.toFixed(2)}</td>
                  <td>{t.currency}</td>
                  <td><Button variant="ghost" size="sm" onClick={() => setEditingTransaction(t)}>Edit</Button></td>
                  <td><Button variant="ghost" size="sm" className="text-red-400" onClick={() => setDeletingTransaction(t)}>Delete</Button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </td>
    </tr>
  )}
  ```

**`toggleExpanded` function**:

```ts
function toggleExpanded(ticker: string) {
  setExpandedTickers((prev) => {
    const next = new Set(prev);
    next.has(ticker) ? next.delete(ticker) : next.add(ticker);
    return next;
  });
}
```

**Edit dialog**: Add a second `<Dialog>` (separate from the add dialog) controlled by `editingTransaction !== null`:

- `open={editingTransaction !== null}` `onOpenChange={(open) => { if (!open) setEditingTransaction(null); }}`
- `DialogTitle`: "Edit transaction"
- Content: `<AddTransactionForm transaction={editingTransaction ?? undefined} onSuccess={handleEditSuccess} onCancel={() => setEditingTransaction(null)} />`

**`handleEditSuccess` function**:

```ts
function handleEditSuccess(updated: Transaction) {
  setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  setEditingTransaction(null);
}
```

**Delete AlertDialog**: Render `<AlertDialog open={deletingTransaction !== null} onOpenChange={(open) => { if (!open && !isDeleteLoading) setDeletingTransaction(null); }}>`:

- Description: "This will permanently delete the {deletingTransaction?.ticker} transaction from {deletingTransaction?.purchase_date}. This action cannot be undone."
- Cancel button closes dialog (disabled when `isDeleteLoading`)
- Confirm button: calls `handleDeleteConfirm()`, shows loading state

**`handleDeleteConfirm` async function**:

1. Set `isDeleteLoading(true)`
2. Call `DELETE /api/transactions/${deletingTransaction!.id}`
3. On success: `setTransactions(prev => prev.filter(t => t.id !== deletingTransaction!.id))`, `setDeletingTransaction(null)`
4. On failure: set a local error state, display inside the dialog
5. Always: `setIsDeleteLoading(false)`

**`handleSuccess` (add)** — rename to `handleAddSuccess` for clarity; same logic as before.

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes with zero type errors
- `npm run lint` passes

#### Manual Verification:

- Clicking a position row expands it; clicking again collapses it
- Expanded section shows all individual transactions for that ticker (date, shares, price, currency)
- Edit button opens dialog pre-filled with that transaction's data; ticker is disabled
- Editing valid data calls PUT (visible in Network tab); row updates in dashboard on success
- Delete button opens AlertDialog with the ticker and date in the description
- Confirming delete removes the transaction row; position row updates its totals
- Deleting the last transaction for a ticker removes the position row entirely
- Add transaction still works as before
- Sign out still works

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding.

---

## Testing Strategy

### Manual Testing Steps:

1. Sign in, open dashboard — verify existing portfolio table is unchanged in appearance
2. Click a position row that has 2+ transactions — verify it expands to show individual rows
3. Click the same row again — verify it collapses
4. Click Edit on a transaction — verify dialog opens with all fields pre-filled
5. Verify ticker field is disabled (cannot type)
6. Change shares and save — verify position row updates totals without page reload
7. Click Delete on a transaction — verify AlertDialog shows correct ticker + date
8. Cancel — verify transaction still exists
9. Click Delete again and confirm — verify row removed; position updates
10. Delete all transactions for one ticker — verify position row disappears
11. Add a new transaction (existing flow) — verify it still works
12. `curl` with a valid session cookie: PUT and DELETE on another user's transaction ID → verify 404
13. `curl` without session: PUT/DELETE → verify 401

## Migration Notes

No schema changes. The `transactions` table schema (from F-01) supports all required operations. No data migration needed.

## References

- PRD: `context/foundation/prd.md` §FR-005, §FR-006
- Roadmap: `context/foundation/roadmap.md` S-04
- Lessons: `context/foundation/lessons.md` (double quotes in TS files)
- Prior slice: `context/archive/2026-06-06-add-transaction/plan.md`
- Portfolio compute: `src/lib/portfolio.ts`
- Transaction types: `src/types/transaction.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: AlertDialog component

#### Automated

- [x] 1.1 `npx astro check` passes with zero errors — bec9f0c
- [x] 1.2 `npm run build` succeeds — bec9f0c
- [x] 1.3 `npm run lint` passes — bec9f0c

#### Manual

- [x] 1.4 `src/components/ui/alert-dialog.tsx` exists — bec9f0c

### Phase 2: PUT + DELETE `/api/transactions/[id].ts`

#### Automated

- [x] 2.1 `npx astro check` passes
- [x] 2.2 `npm run lint` passes

#### Manual

- [x] 2.3 Authenticated PUT with valid body on own transaction returns 200 with updated row
- [x] 2.4 Authenticated DELETE on own transaction returns 200 `{ success: true }`
- [x] 2.5 Unauthenticated PUT/DELETE returns 401
- [x] 2.6 PUT with invalid body returns 400 with descriptive message
- [x] 2.7 DELETE on non-existent or other user's transaction returns 404

### Phase 3: AddTransactionForm edit mode

#### Automated

- [ ] 3.1 `npx astro check` passes
- [ ] 3.2 `npm run lint` passes

#### Manual

- [ ] 3.3 Edit mode shows all fields pre-filled
- [ ] 3.4 Ticker field is visually disabled and cannot be typed into
- [ ] 3.5 Edit form submits PUT (visible in DevTools Network tab)
- [ ] 3.6 Add mode still works as before (POST, all fields editable)

### Phase 4: DashboardView — expandable rows + edit/delete UX

#### Automated

- [ ] 4.1 `npx astro check` passes with zero type errors
- [ ] 4.2 `npm run lint` passes

#### Manual

- [ ] 4.3 Clicking a position row expands/collapses it
- [ ] 4.4 Expanded section shows individual transactions with correct data
- [ ] 4.5 Edit dialog opens pre-filled; ticker is disabled
- [ ] 4.6 Saving edit updates the row without page reload
- [ ] 4.7 Delete AlertDialog shows correct ticker and date
- [ ] 4.8 Confirming delete removes the transaction; position updates
- [ ] 4.9 Deleting last transaction for a ticker removes the position row
- [ ] 4.10 Add transaction still works
- [ ] 4.11 Sign out still works
