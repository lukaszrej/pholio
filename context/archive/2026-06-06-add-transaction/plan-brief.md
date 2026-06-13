# Add Transaction — Plan Brief

> Full plan: `context/changes/add-transaction/plan.md`
> Research: `context/changes/add-transaction/research.md`

## What & Why

Allow authenticated users to record stock purchase transactions via a modal dialog on the dashboard. This is S-02 — the prerequisite that unlocks the North Star feature S-03 (portfolio ROI view with current prices). Without transaction data in the DB, there is nothing to display in the portfolio table.

## Starting Point

The `transactions` table and TypeScript types exist (F-01, done). The dashboard renders a welcome message with no data or forms. No form validation library, no shadcn primitives beyond Button, and no server-side data fetching pattern exists in the app yet.

## Desired End State

A logged-in user lands on the dashboard, sees a table of their transactions (or an empty-state CTA if none exist), clicks "Add transaction", fills in a modal form, submits — and the new row appears in the table immediately without a page reload. The transaction is persisted to Supabase and survives a refresh.

## Key Decisions Made

| Decision           | Choice                                    | Why (1 sentence)                                                              | Source   |
| ------------------ | ----------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| Form location      | Modal dialog on dashboard                 | No navigation hop; user sees the list in context                              | Plan     |
| Validation library | react-hook-form + zod                     | Industry-standard typed validation; sets foundation for future forms          | Plan     |
| API communication  | fetch + JSON (not native form POST)       | react-hook-form `handleSubmit` returns typed JS values, not FormData          | Plan     |
| Success UX         | Optimistic update (append to React state) | Instant feedback without a full page reload                                   | Plan     |
| Transaction list   | React component with local state          | Required to support optimistic updates after modal submit                     | Plan     |
| API auth check     | Explicit 401 in route handler             | `/api/transactions` is not in middleware PROTECTED_ROUTES; must self-guard    | Research |
| Ticker             | No validation, auto-uppercase only        | KISS per PRD §FR-004; real-time validation deferred to v2                     | Research |
| Numeric coercion   | `z.coerce.number()` in zod schema         | HTML number inputs in JSON context submit as numbers; zod coerce handles both | Plan     |

## Scope

**In scope:**

- Install react-hook-form, @hookform/resolvers, zod, shadcn Input/Label/Select/Dialog
- Shared zod schema (`src/lib/transaction-schema.ts`) used by form + API
- POST `/api/transactions` — validates, inserts, returns created row
- `AddTransactionForm` React component (5 fields: ticker, price, date, currency, shares)
- `DashboardView` React component — dialog state + list state + table + empty state
- Dashboard page update — server-side Supabase fetch + render DashboardView

**Out of scope:**

- Ticker validation against external API (v2)
- Edit/delete rows (S-04)
- Current price / ROI column (S-03)
- Currency conversion (v2)
- Pagination

## Architecture / Approach

```
dashboard.astro (server)
  → fetches transactions via Supabase in frontmatter
  → renders <DashboardView client:load initialTransactions={...} />

DashboardView.tsx (React, client)
  → owns transactions[] state + isDialogOpen state
  → renders table or empty-state + "Add transaction" button
  → Dialog wraps AddTransactionForm

AddTransactionForm.tsx (React, inside Dialog)
  → react-hook-form + zodResolver + shadcn primitives
  → fetch POST /api/transactions (JSON)
  → calls onSuccess(newTransaction) → DashboardView appends to state

src/pages/api/transactions/index.ts (server)
  → auth check → zod validation → Supabase insert → return 201 + row
```

## Phases at a Glance

| Phase                    | What it delivers                                                          | Key risk                                                                 |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Install deps + schema | react-hook-form, zod, shadcn Input/Label/Select/Dialog; shared zod schema | shadcn CSS vars may conflict with custom dark theme                      |
| 2. API route             | POST `/api/transactions` — validated, authenticated, returns created row  | First JSON API route (diverges from existing redirect-based auth routes) |
| 3. AddTransactionForm    | Form component with client-side + server-error handling                   | react-hook-form + shadcn Form wiring is new to this codebase             |
| 4. Dashboard integration | DashboardView + server-side fetch + table + empty state                   | First server-side data fetch in Astro frontmatter outside auth           |

**Prerequisites:** S-01 (auth, done), F-01 (transactions table, done), FINNHUB_API_KEY not needed for this change.
**Estimated effort:** ~2-3 sessions across 4 phases.

## Open Risks & Assumptions

- shadcn's default CSS variables (`--background`, `--foreground`, etc.) may not match the project's custom cosmic dark theme — verify visually after Phase 1 install and apply Tailwind overrides if needed
- Sign-out button currently lives inline in `dashboard.astro`; Phase 4 must preserve it (move above/below `DashboardView`, not delete it)

## Success Criteria (Summary)

- Authenticated user can open the modal, fill the form, submit, and see the new transaction in the table without a page reload
- Invalid inputs (empty ticker, negative price) show field-level errors before any network request
- Unauthenticated POST to `/api/transactions` returns HTTP 401
