# Multi-Portfolio System — Plan Brief

> Full plan: `context/changes/dual-portfolio-view/plan.md`
> Frame brief: `context/changes/dual-portfolio-view/frame.md`

## What & Why

The current app shows a single flat portfolio. The actual problem to plan around is: build a portfolio management system — a new `portfolios` table, a `portfolio_id` column on `transactions`, portfolio CRUD, a portfolio picker in the transaction form, and a restructured dashboard that renders a named section (table + summary + sector chart) per portfolio. The initial framing named only the output layer; the frame established the real scope runs five layers deep from schema up.

## Starting Point

`transactions` has `user_id` only — no portfolio concept anywhere in schema, API, or UI. Every portfolio lib function operates on a flat `Transaction[]`. `DashboardView` renders one table, one summary card, one sector chart.

## Desired End State

A logged-in user sees an "All Portfolios" combined summary at the top of the dashboard, followed by one named section per portfolio — each with its own summary card, sortable position table, and sector allocation chart. The user can create, rename, and delete portfolios inline from the dashboard. Every add/edit transaction form includes a required portfolio picker.

## Key Decisions Made

| Decision                 | Choice                                                                                    | Why (1 sentence)                                                                            | Source |
| ------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------ |
| Scope                    | 5 layers: schema → CRUD → form → dashboard → analytics                                    | User confirmed separate data silos and N-portfolio flexibility — UI-only approach dead-ends | Frame  |
| Backfill strategy        | Auto-create "My Portfolio" per user; assign all existing transactions                     | Zero orphan rows after migration; user can rename later                                     | Plan   |
| Delete safety            | Block delete if transactions exist (409); ON DELETE RESTRICT FK                           | Explicit user intent required before any data loss                                          | Plan   |
| Portfolio picker         | Required field; defaults to first portfolio                                               | Every transaction must be assigned; reduces friction on the common case                     | Plan   |
| Dashboard layout         | Vertical stack — one named section per portfolio                                          | Matches existing single-portfolio shape; all portfolios visible simultaneously              | Plan   |
| Portfolio CRUD placement | Inline on dashboard (rename/delete icons in section header; "+ Add portfolio" in toolbar) | Zero navigation overhead; everything in context                                             | Plan   |
| Combined summary         | Yes — "All Portfolios" card at top                                                        | User explicitly asked for a combined total; answers the primary at-a-glance question        | Plan   |
| LotsModal scoping        | Scoped to the portfolio from which it was opened                                          | Edit/delete actions should act on portfolio-attributed data only                            | Plan   |

## Scope

**In scope:**

- `portfolios` table with RLS + per-user backfill migration
- Portfolio CRUD API (`/api/portfolios`, `/api/portfolios/[id]`)
- `portfolio_id` on transactions (schema, Zod, form, API ownership check)
- Dashboard: combined summary + per-portfolio sections + inline portfolio management
- New `PortfolioSection` component (extracts table + sort logic from DashboardView)

**Out of scope:**

- Transaction reassignment UI (user deletes + re-adds to move between portfolios)
- Cross-portfolio LotsModal view
- Changes to `LotsModal`, `prices`/`sectors` tables, or `portfolio.ts` function signatures

## Architecture / Approach

Schema-first, then API, then form, then UI. `portfolio.ts` functions remain unchanged — per-portfolio computation happens at the call site by filtering `transactions` by `portfolio_id` before passing the slice to `computePositions()`. Combined summary uses the existing function with all transactions. RLS auto-scopes portfolio queries; API routes add an explicit ownership check before transaction writes (FK alone does not validate that the target portfolio belongs to the current user).

## Phases at a Glance

| Phase                     | What it delivers                                                                           | Key risk                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 1. Schema Foundation      | `portfolios` table + `portfolio_id` on transactions + TS types                             | Backfill PL/pgSQL must handle users with zero transactions gracefully; NOT NULL applied only after loop                |
| 2. Portfolio CRUD API     | GET/POST `/api/portfolios`, PUT/DELETE `/api/portfolios/[id]`                              | Delete must check transaction count before touching the DB (409 vs raw FK error)                                       |
| 3. Transaction Assignment | `portfolio_id` in Zod schema, form picker, API ownership validation                        | Portfolio picker default requires form to receive portfolios list; ownership check prevents cross-user FK assignment   |
| 4. Dashboard Restructure  | PortfolioSection component, DashboardView multi-portfolio refactor, dashboard.astro update | Largest component change; sort state moves to PortfolioSection; LotsModal must receive portfolio-filtered transactions |

**Prerequisites:** Phases 1 and 2 must be deployed before Phase 3 can be tested end-to-end; Phase 4 depends on all prior phases.
**Estimated effort:** ~4 sessions across 4 phases (one phase per session).

## Open Risks & Assumptions

- If a user has transactions in multiple currencies across both portfolios, the "All Portfolios" combined summary will show `null` for P&L (same behaviour as the current single-portfolio mixed-currency case — not a regression)
- First run for a new user: dashboard shows the "no portfolios" empty state → user must create a portfolio before adding any transaction

## Success Criteria (Summary)

- A user with existing transactions sees all prior transactions under a "My Portfolio" section on the dashboard with no manual migration step
- Creating a second portfolio and adding transactions to it produces an independent section with its own summary, table, and sector chart
- Deleting a non-empty portfolio is blocked with a clear error message; deleting an empty portfolio works
