# Lots Modal Implementation Plan

## Overview

Replace the inline `expandedTickers` row-expansion pattern with a `LotsModal` component. Clicking a ticker row in the portfolio table opens a dialog showing all its lots (Date, Shares, Price, Currency, Edit, Delete). The existing Add/Edit/Delete dialogs are unchanged — only their triggers for Edit and Delete move into the modal.

## Current State Analysis

`DashboardView.tsx` (~343 lines) manages all portfolio UI and owns six `useState` variables. Clicking a ticker row calls `toggleExpanded(ticker)` which toggles a `Set<string>` (`expandedTickers`). When a ticker is in the set, a sibling `<tr colSpan={9}>` containing an inner table renders inline below it (lines 195–249). The Edit and Delete buttons in that inner table already open Dialog/AlertDialog modals.

All the infrastructure we need is already present:
- `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` in `src/components/ui/dialog.tsx`
- `AddTransactionForm` (used for add and edit) in `src/components/transactions/AddTransactionForm.tsx`
- `AlertDialog` (used for delete confirmation) in `src/components/ui/alert-dialog.tsx`
- `formatShares` helper at `DashboardView.tsx:34–37` (needs to move to the shared format lib)

## Desired End State

Clicking any row in the portfolio table opens a `LotsModal` dialog (`sm:max-w-2xl`) titled `"{TICKER} — Lots"` listing all lots for that ticker with Edit and Delete actions. The Edit and Delete dialogs open on top of the LotsModal (Radix portal layering — safe). Deleting the last lot for a ticker auto-closes the modal. The global "Add transaction" button below the table is unchanged. The inline row-expansion is gone.

### Key Discoveries

- `toggleExpanded` at `DashboardView.tsx:74–84` is the only consumer of `expandedTickers` — safe to delete entirely
- The inline sub-table at `DashboardView.tsx:195–249` is a self-contained block; it can be lifted verbatim into `LotsModal` with only import adjustments
- `formatShares` is a 4-line pure function; it belongs in `src/lib/format.ts` alongside `formatSigned` and `pnlClass` (already imported from there)
- Radix portals render at `document.body` — a Dialog opened inside another Dialog's content is rendered as a sibling portal, not nested; focus, scroll-lock, and z-index all work correctly with no extra configuration
- The `onDeleteRequest` callback must also reset `deleteError` state (`setDeleteError(null)`) before setting `deletingTransaction` — the caller in DashboardView handles this; LotsModal's prop is a single `(t: Transaction) => void` callback that DashboardView wires as a wrapper

## What We're NOT Doing

- No changes to `AddTransactionForm`, API routes, Zod schema, or TypeScript types
- No `defaultTicker` prop — the global "Add transaction" button remains below the table, ticker entered manually
- No change to the Add Transaction Dialog — it stays exactly as-is
- No change to the Edit Transaction Dialog or Delete AlertDialog — structure unchanged, triggers move
- No new state management library or context — local `useState` pattern throughout

## Implementation Approach

Two-phase additive-then-swap approach: Phase 1 creates the new `LotsModal` component (additive, no deletions); Phase 2 replaces the old expansion pattern in `DashboardView` with the new component. This means Phase 1 can be verified in isolation (TypeScript + lint) before touching the live UI logic.

## Critical Implementation Details

**State update ordering for auto-close on last-lot delete**: In `handleDeleteConfirm`, the check for "is this the last lot for this ticker?" must read from the *current* `transactions` state (not from a React updater function) before calling `setTransactions`. Compute `hasRemainingLots` from the current `transactions` array in scope before the `setTransactions` call, then call `setSelectedTicker(null)` as a separate `setState` after:

```tsx
const ticker = deletingTransaction.ticker.toUpperCase();
const hasRemainingLots = transactions.some(
  (t) => t.id !== deletingTransaction.id && t.ticker.toUpperCase() === ticker
);
setTransactions((prev) => prev.filter((t) => t.id !== deletingTransaction.id));
setDeletingTransaction(null);
if (!hasRemainingLots) setSelectedTicker(null);
```

---

## Phase 1: Extract `formatShares` and Create `LotsModal`

### Overview

Move the `formatShares` helper to the shared format library, then create the new `LotsModal` component using the lifted sub-table from `DashboardView`. At the end of this phase the new component exists and compiles, but nothing in the UI has changed yet.

### Changes Required

#### 1. Add `formatShares` to the shared format library

**File**: `src/lib/format.ts`

**Intent**: Export `formatShares` from the shared format lib so both `DashboardView` and `LotsModal` can import it from one place. This avoids duplicating the function or creating an import dependency from LotsModal back to DashboardView.

**Contract**: Append an exported `formatShares(n: number): string` function. Implementation is identical to `DashboardView.tsx:34–37` (integer check, fallback to 4 dp with trailing zeros stripped).

#### 2. Update `DashboardView` to import `formatShares` from `@/lib/format`

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Remove the now-duplicated local `formatShares` definition and pull it from the shared lib.

**Contract**: Delete lines 34–37 (the local `formatShares` function). Add `formatShares` to the existing named import from `"@/lib/format"` at line 25.

#### 3. Create `LotsModal` component

**File**: `src/components/transactions/LotsModal.tsx` (new file)

**Intent**: A controlled Dialog component that shows all lots for a given ticker in a table, with Edit and Delete action buttons per row. Content is lifted directly from the inline sub-table at `DashboardView.tsx:195–248`, with the two button `onClick` handlers replaced by the `onEditRequest` and `onDeleteRequest` callbacks.

**Contract**:

```tsx
interface Props {
  ticker: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Transaction[];
  onEditRequest: (t: Transaction) => void;
  onDeleteRequest: (t: Transaction) => void;
}
```

- `DialogContent` receives `className="sm:max-w-2xl"` to override the default `sm:max-w-lg`
- `DialogTitle` renders `{ticker} — Lots`
- The lot table filters `transactions` by `t.ticker.toUpperCase() === ticker` and sorts ascending by `t.purchase_date` (same logic as the current inline table)
- Columns: Date | Shares | Price | Currency | Edit button (ghost sm) | Delete button (ghost sm, `text-red-600`)
- `formatShares` is imported from `"@/lib/format"`

### Success Criteria

#### Automated Verification

- TypeScript compiles with no errors: `npx tsc --noEmit`
- Lint passes: `npx eslint src/components/transactions/LotsModal.tsx src/lib/format.ts src/components/transactions/DashboardView.tsx`

#### Manual Verification

- No visible change in the UI — inline row expansion still works (DashboardView not yet wired to LotsModal)

**Implementation Note**: After Phase 1 automated checks pass, confirm that the app still renders correctly (ticker rows still expand inline) before proceeding to Phase 2.

---

## Phase 2: Replace Inline Expansion with `LotsModal` in `DashboardView`

### Overview

Swap out `expandedTickers` and the inline sub-table for `LotsModal`. After this phase the inline expansion is gone and clicking a ticker row opens the modal.

### Changes Required

#### 1. Replace `expandedTickers` state with `selectedTicker`

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: The `Set<string>` expansion state no longer makes sense with a single-modal approach. Replace it with a nullable ticker string that drives `LotsModal`'s `open` prop.

**Contract**: Remove `expandedTickers` state (line 59) and the `toggleExpanded` function (lines 74–84). Add `const [selectedTicker, setSelectedTicker] = useState<string | null>(null)` in their place.

#### 2. Update ticker row click handler

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Clicking a ticker row now opens `LotsModal` for that ticker rather than toggling an inline expansion.

**Contract**: Replace `onClick={() => { toggleExpanded(pos.ticker); }}` (lines 163–165) with `onClick={() => setSelectedTicker(pos.ticker)}`.

#### 3. Replace stateful chevron with static `ChevronRight`

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: The chevron no longer reflects an expanded/collapsed state; it's a static visual cue that the row is interactive.

**Contract**: Replace the conditional `{expandedTickers.has(pos.ticker) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}` (lines 188–192) with a static `<ChevronRight className="size-4" />`. Remove `ChevronDown` from the lucide-react import at line 24.

#### 4. Remove the inline sub-table block

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: The inline `<tr>` that rendered the lot sub-table is replaced by `LotsModal`; it can be deleted entirely.

**Contract**: Remove lines 195–249 (the `{expandedTickers.has(pos.ticker) && (<tr key={...}>...</tr>)}` block).

#### 5. Add `<LotsModal>` in the dialogs section and wire the auto-close on last-lot delete

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Mount `LotsModal` alongside the existing Add/Edit/Delete dialogs so it renders in the Radix portal layer. Also update `handleDeleteConfirm` to close the modal if the deleted lot was the last one for its ticker.

**Contract**:

Import `LotsModal` from `"@/components/transactions/LotsModal"`.

Add after the existing "Edit transaction dialog" block (after line 310):

```tsx
{/* Lots modal */}
<LotsModal
  ticker={selectedTicker ?? ""}
  open={selectedTicker !== null}
  onOpenChange={(open) => { if (!open) setSelectedTicker(null); }}
  transactions={transactions}
  onEditRequest={setEditingTransaction}
  onDeleteRequest={(t) => { setDeleteError(null); setDeletingTransaction(t); }}
/>
```

In `handleDeleteConfirm` (line 91), add the auto-close logic after the `response.ok` check, before the existing `setTransactions` call. See "Critical Implementation Details" above for the exact state-read-before-update pattern to use.

### Success Criteria

#### Automated Verification

- TypeScript compiles with no errors: `npx tsc --noEmit`
- Lint passes: `npx eslint src/components/transactions/DashboardView.tsx`

#### Manual Verification

- Clicking any ticker row in the portfolio table opens `LotsModal` with the correct ticker name in the title
- All lots for that ticker are listed with correct Date, Shares, Price, Currency values
- Edit button inside the modal opens the Edit Transaction dialog (on top of the modal); saving closes the edit dialog and updates the lot row in the modal
- Delete button inside the modal opens the Delete confirmation dialog; confirming removes the lot from the modal list
- Deleting the last lot for a ticker closes the LotsModal
- The global "Add transaction" button below the table still works and opens the Add Transaction dialog
- Inline row expansion is gone — no sub-table appears below any ticker row
- No regressions on the Add / Edit / Delete flows

**Implementation Note**: After all automated and manual verification passes, the change is complete. No further phases.

---

## Testing Strategy

### Manual Testing Steps

1. Load the dashboard with at least two tickers, each with multiple lots
2. Click each ticker row — verify LotsModal opens with the correct ticker name and all lots
3. Edit a lot from inside LotsModal — verify the edit dialog opens, saving reflects in the lot row
4. Delete a lot from inside LotsModal — verify confirmation dialog opens, confirming removes the row
5. Delete the last lot for a ticker — verify LotsModal closes automatically
6. Open LotsModal, then close it via the X button or backdrop click — verify it closes cleanly
7. Click "Add transaction" global button — verify Add dialog opens (no ticker pre-filled) and adding a new transaction works
8. Verify no inline sub-table rows appear by clicking ticker rows

## References

- Research: `context/changes/modal-add-edit-transaction/research.md`
- Prior slice (crud patterns): `context/archive/2026-06-10-transaction-crud/plan.md`
- DashboardView (main file): `src/components/transactions/DashboardView.tsx`
- AddTransactionForm (unchanged): `src/components/transactions/AddTransactionForm.tsx`
- Dialog component: `src/components/ui/dialog.tsx`
- Format lib: `src/lib/format.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extract `formatShares` and Create `LotsModal`

#### Automated

- [x] 1.1 TypeScript compiles with no errors after Phase 1 changes — 2fc306a
- [x] 1.2 Lint passes on LotsModal, format.ts, DashboardView — 2fc306a

#### Manual

- [x] 1.3 UI unchanged — inline row expansion still works after Phase 1 — 2fc306a

### Phase 2: Replace Inline Expansion with `LotsModal` in `DashboardView`

#### Automated

- [x] 2.1 TypeScript compiles with no errors after Phase 2 changes — a8217d7
- [x] 2.2 Lint passes on DashboardView — a8217d7

#### Manual

- [x] 2.3 Clicking a ticker row opens LotsModal with correct ticker and lots — a8217d7
- [x] 2.4 Edit button inside LotsModal opens Edit dialog; saving updates the lot in-place — a8217d7
- [x] 2.5 Delete button inside LotsModal opens Delete confirmation; confirming removes the lot — a8217d7
- [x] 2.6 Deleting last lot for a ticker auto-closes LotsModal — a8217d7
- [x] 2.7 Global "Add transaction" button still opens Add dialog (no ticker pre-filled) — a8217d7
- [x] 2.8 No inline sub-table expansion remains on any ticker row — a8217d7
