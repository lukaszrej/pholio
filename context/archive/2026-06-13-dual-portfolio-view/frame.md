# Frame Brief: Multi-Portfolio System

> Framing step before /10x-plan. This document captures what is _actually_
> at issue, separated from what was initially assumed.

## Reported Observation

The current app shows a single portfolio table, one summary card, and one
sector allocation chart. The user wants to track two distinct named portfolios
simultaneously (e.g. "Regular Investing" and "Retiring") and see them
separately throughout the UI.

## Initial Framing (preserved)

- **User's stated cause or approach**: Duplicate the portfolio table alongside the existing one, each with a named header; split the summary card and sector allocation chart to be per-portfolio.
- **User's proposed direction**: Add a second table to the dashboard, update the summary to show per-portfolio market value + P&L + combined total, and render two sector charts.
- **Pre-dispatch narrowing**: Separate data silos per portfolio (not a UI filter); N portfolios flexible; portfolio names user-configurable and stored in the database.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Database schema** — no `portfolios` table exists; `transactions` has no `portfolio_id` column; every query aggregates all transactions for a user as one flat set.
2. **Portfolio management CRUD** — no UI or API exists to create, name, or delete a portfolio.
3. **Transaction assignment** — the add/edit transaction form has no portfolio picker; the API insert writes no `portfolio_id`; existing transactions have no portfolio assignment.
4. **Dashboard/view structure** — `DashboardView.tsx` renders one table, one summary card, one sector chart; there is no per-portfolio routing or tab structure.
5. **Analytics components** — `PortfolioSummaryCard` and `SectorAllocationChart` receive pre-aggregated data with no portfolio filter. ← **initial framing**

## Hypothesis Investigation

| Hypothesis                                      | Evidence                                                                                                                                                             | Verdict |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Schema must change: no portfolio concept at all | `supabase/migrations/20260604111725_create_transactions.sql`: transactions table has `user_id` only, no `portfolio_id`; no migrations for a `portfolios` table exist | STRONG  |
| Portfolio CRUD is entirely absent               | No API route, component, or page handles portfolio creation/rename/delete                                                                                            | STRONG  |
| Transaction form needs a portfolio picker       | `AddTransactionForm.tsx` l.75–174: five fields only (ticker, date, price, shares, currency); schema at `transaction-schema.ts` has no portfolio field                | STRONG  |
| Dashboard must be restructured                  | `DashboardView.tsx` l.167–280: assembles one `PortfolioSummaryCard`, one sortable table, one `SectorAllocationChart`; no branching on portfolio                      | STRONG  |
| Analytics components need per-portfolio data    | `computePositions()` and `computePortfolioSummary()` in `src/lib/portfolio.ts` operate on a flat `Transaction[]` with no portfolio filter                            | STRONG  |

## Narrowing Signals

- User confirmed: separate data silos (not UI filtering) → schema change is mandatory, not optional.
- User confirmed: N portfolios, user-configurable names → a `portfolios` table is required; hardcoded two-portfolio approach would dead-end the feature.
- Cross-system check: no archive entry, no shape-note, no source file references any portfolio concept — this is net-new from the data model up.

## Cross-System Convention

The existing access control pattern (all user data scoped by `user_id` with RLS) maps cleanly onto a `portfolios` table: add `user_id` on `portfolios`, add `portfolio_id` FK on `transactions`, and RLS policies follow the same shape already used for transactions. This is the conventional approach for per-user resource grouping in the existing stack.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: build a portfolio management system — a new `portfolios` table, a `portfolio_id` column on `transactions`, portfolio CRUD, a portfolio picker in the transaction form, and a restructured dashboard that renders a named table + summary card + sector chart per portfolio.

The initial framing named only the last output layer (split charts and summary). The real scope is five layers deep: schema → portfolio CRUD → transaction assignment → dashboard restructuring → per-portfolio analytics. Addressing only the analytics layer without the upstream layers produces an unpersistable, hardcoded view that breaks the moment a third portfolio is needed.

## Confidence

**HIGH** — zero portfolio concept exists anywhere in the codebase (schema, API, UI, or archive); user's pre-dispatch answers confirm data-silo separation and N-portfolio flexibility are explicit requirements; the required changes are unambiguous at every layer.

## What Changes for /10x-plan

The plan must cover all five layers in dependency order:

1. New `portfolios` migration + RLS; nullable `portfolio_id` on `transactions` with a backfill strategy for existing rows.
2. Portfolio CRUD API routes + UI (create/rename/delete portfolio, with confirmation for delete).
3. Transaction form: portfolio selector field; API routes updated to write/read `portfolio_id`.
4. Dashboard restructured to loop over the user's portfolios and render a named section (table + summary + sector chart) per portfolio.
5. `computePositions`, `computePortfolioSummary`, `computeSectorAllocation` in `src/lib/portfolio.ts` accept a `portfolioId` filter parameter.

## References

- Schema: `supabase/migrations/20260604111725_create_transactions.sql`
- Transaction type: `src/types/transaction.ts`
- Validation schema: `src/lib/transaction-schema.ts`
- Form: `src/components/transactions/AddTransactionForm.tsx`
- Dashboard assembly: `src/pages/dashboard.astro`, `src/components/transactions/DashboardView.tsx`
- Portfolio lib: `src/lib/portfolio.ts`
- Summary card: `src/components/portfolio/PortfolioSummaryCard.tsx`
- Sector chart: `src/components/portfolio/SectorAllocationChart.tsx`
