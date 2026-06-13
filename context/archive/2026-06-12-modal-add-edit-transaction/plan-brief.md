# Lots Modal — Plan Brief

> Full plan: `context/changes/modal-add-edit-transaction/plan.md`
> Research: `context/changes/modal-add-edit-transaction/research.md`

## What & Why

Replace the inline ticker-row expansion with a `LotsModal` dialog. Currently clicking a portfolio row appends an inline sub-table beneath it — a pattern the user wants gone in favour of a clean modal. All CRUD infrastructure (Dialog, AlertDialog, AddTransactionForm, API routes) is already in place; this change is purely a UX surface swap.

## Starting Point

`DashboardView.tsx` manages a `Set<string>` called `expandedTickers`; clicking a position row toggles it, rendering an inline `<tr colSpan={9}>` with a nested table of lots. The Edit and Delete buttons in that table already open the existing Dialog and AlertDialog modals, so only the _discovery surface_ (the inline table itself) is changing.

## Desired End State

Clicking a ticker row opens a `LotsModal` dialog (`{TICKER} — Lots`, `sm:max-w-2xl`) listing all lots for that ticker with Edit and Delete action buttons. Editing or deleting opens the existing dialogs on top of the modal (Radix portal layering — no extra config needed). Deleting the last lot for a ticker auto-closes the modal. The global "Add transaction" button below the table is unchanged. No inline row expansion anywhere.

## Key Decisions Made

| Decision                      | Choice                    | Why                                                                                       | Source                                                                              |
| ----------------------------- | ------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---- |
| "Add transaction" placement   | Keep global button only   | Avoids `AddTransactionForm` prop changes; user closes context to add new tickers          | Plan                                                                                |
| Component architecture        | New `LotsModal` component | Cleaner separation; user named it (tax lots domain term)                                  | Plan                                                                                |
| Modal width                   | `sm:max-w-2xl` (~672px)   | 6-column lot table needs horizontal breathing room                                        | Plan                                                                                |
| State variable                | `selectedTicker: string   | null`replaces`expandedTickers: Set<string>`                                               | Single-modal pattern consistent with `editingTransaction` and `deletingTransaction` | Plan |
| Auto-close on last-lot delete | Yes                       | Avoids showing a modal for a ticker that no longer exists in the portfolio                | Plan                                                                                |
| Nested modals                 | Safe with Radix portals   | Radix Dialog renders to `document.body`; stacked portals handle focus + z-index correctly | Research                                                                            |

## Scope

**In scope:**

- New `src/components/transactions/LotsModal.tsx` component
- Move `formatShares` helper from `DashboardView.tsx` to `src/lib/format.ts`
- Replace `expandedTickers` + `toggleExpanded` in `DashboardView.tsx` with `selectedTicker: string | null`
- Remove the inline `<tr>` sub-table from the portfolio table
- Wire `<LotsModal>` into `DashboardView`'s dialogs section
- Auto-close `LotsModal` when last lot is deleted

**Out of scope:**

- No changes to `AddTransactionForm`, API routes, Zod schema, or TypeScript types
- No `defaultTicker` pre-fill in the Add Transaction dialog
- No new state management library or context

## Architecture / Approach

`LotsModal` is a controlled component: `open` and `onOpenChange` props come from `DashboardView`, exactly like the existing Edit Transaction Dialog. The lot table content is lifted from the current inline sub-table. The `onEditRequest` and `onDeleteRequest` callbacks call the existing `setEditingTransaction` / `setDeletingTransaction` setters — those dialogs continue working unchanged.

## Phases at a Glance

| Phase               | What it delivers                                                                                     | Key risk                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1. Extract + Create | `formatShares` in shared lib; `LotsModal.tsx` created and compiling; UI still shows inline expansion | `formatShares` import update breaks DashboardView TypeScript                                             |
| 2. Swap             | `expandedTickers` removed; inline sub-table gone; `LotsModal` wired; auto-close on last-lot delete   | State-read-before-update ordering in `handleDeleteConfirm` (see Critical Implementation Details in plan) |

**Prerequisites:** None — this change is self-contained within the frontend  
**Estimated effort:** ~1 session across 2 phases

## Open Risks & Assumptions

- `formatShares` is only used in `DashboardView.tsx` and `LotsModal.tsx` — if other components use it (unlikely), they'll need updating too
- Radix stacked portal behavior was confirmed in research but not smoke-tested in this app — manual verification step 2.3–2.5 covers this

## Success Criteria (Summary)

- Clicking a ticker row opens `LotsModal`; no inline expansion appears anywhere
- Edit and Delete flows from inside the modal work correctly and leave the modal open
- Deleting the last lot for a ticker closes the modal automatically
