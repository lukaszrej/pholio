# Transaction CRUD (Edit + Delete) — Plan Brief

> Full plan: `context/changes/transaction-crud/plan.md`

## What & Why

Add edit and delete capabilities for individual stock purchase transactions (FR-005, FR-006). Users currently can only add transactions — there's no way to correct a mistake or remove a position. This slice closes the basic CRUD loop for S-04.

## Starting Point

The dashboard shows an aggregated positions table (by ticker). The `transactions[]` array lives in React state but individual transaction rows are not visible to the user. `AddTransactionForm` handles POST only; the API has no PUT or DELETE handlers. `AlertDialog` is the one missing shadcn component.

## Desired End State

Clicking a ticker row in the portfolio table expands it to show all individual transactions for that ticker. Each transaction row has Edit (opens pre-filled dialog, ticker locked) and Delete (opens AlertDialog confirmation). Saving or confirming updates React state immediately — no page reload. Deleting the last transaction for a ticker removes the position row.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Where individual transactions are accessible | Expandable ticker rows | Compact, shows grouping naturally, no page structure change | Plan |
| Edit form reuse | Extend AddTransactionForm with optional `transaction` prop | One component to maintain; follows existing pattern | Plan |
| Ticker editable in edit mode? | Locked (disabled) | Prevents silent ticker reassignment; wrong ticker requires delete + re-add | Plan |
| State update strategy | Update on API success (no page refetch) | Consistent with how Add works; no rollback complexity needed | Plan |
| Delete confirmation pattern | shadcn AlertDialog | More deliberate than inline confirm; harder to misclick | Plan |

## Scope

**In scope:**
- `GET`-less `[id].ts` route: `PUT` (edit) + `DELETE`
- `AddTransactionForm` edit mode: pre-fill, locked ticker, PUT submit
- `DashboardView`: expandable rows, edit dialog, delete AlertDialog, state updates

**Out of scope:**
- Ticker editing in edit mode (delete + re-add required)
- Soft delete / undo
- Batch delete
- Transaction history / audit log

## Architecture / Approach

New API file `src/pages/api/transactions/[id].ts` handles PUT and DELETE. RLS (already active) enforces ownership at the DB level — no explicit user ID check needed in application code. The same `transactionSchema` validates PUT bodies. `DashboardView` gains three new state variables (`expandedTickers`, `editingTransaction`, `deletingTransaction`) and re-computes positions via the existing `useMemo` on every state change — no extra compute logic needed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. AlertDialog component | Missing shadcn primitive installed | None — pure install |
| 2. PUT + DELETE API | Server-side edit and delete with auth + RLS | 404 vs RLS error distinction |
| 3. AddTransactionForm edit mode | Pre-fill + locked ticker + PUT submit | RHF disabled-field behaviour |
| 4. DashboardView expandable rows | Full edit/delete UX wired to state | Set state immutability; ColSpan alignment |

**Prerequisites:** S-02 complete (done); shadcn Dialog already installed.
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- Disabled HTML input in react-hook-form: value still submitted (verified by RHF docs). If this assumption is wrong, Phase 3 needs a hidden input for ticker.
- AlertDialog install via `npx shadcn add alert-dialog` should work without conflicts — same pattern used for all other shadcn components in this project.

## Success Criteria (Summary)

- User can edit all fields of a transaction except ticker, and changes persist and appear immediately in the portfolio table.
- User can permanently delete a transaction after confirmation, with the position row disappearing automatically when the last transaction for a ticker is removed.
- No regression in the existing Add transaction flow or the portfolio ROI display.
