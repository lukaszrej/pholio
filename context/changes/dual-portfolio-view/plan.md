# Multi-Portfolio System Implementation Plan

## Overview

Build a multi-portfolio system end-to-end: a new `portfolios` table, a `portfolio_id` column on `transactions` (with backfill for existing rows), portfolio CRUD, a portfolio picker in the transaction form, and a restructured dashboard that renders a combined summary + one named section (summary card + sortable table + sector chart) per portfolio.

## Current State Analysis

`transactions` has only `user_id` — no `portfolio_id` column; all rows are a flat per-user set.
`computePositions` / `computePortfolioSummary` / `computeSectorAllocation` in `portfolio.ts` accept a flat `Transaction[]` with no portfolio filter.
`DashboardView.tsx` assembles one `PortfolioSummaryCard`, one sortable table, one `SectorAllocationChart` — no portfolio branching.
No portfolio concept exists anywhere in schema, API, UI, or archive.

## Desired End State

A logged-in user sees a "All Portfolios" combined summary at the top of the dashboard, followed by one named section per portfolio — each containing its own summary card, sortable position table, and sector allocation chart. The user can create, rename, and delete portfolios inline from the dashboard. Adding or editing a transaction includes a required portfolio picker that defaults to the first portfolio.

### Key Discoveries:

- `set_updated_at()` function is already defined in `20260604111725_create_transactions.sql` — portfolios migration reuses it without redefining
- `SortKey`, `sortIcon`, `formatCurrentPrice`, `formatPriceDate` are currently module-level in `DashboardView.tsx` — they move to the new `PortfolioSection.tsx` in Phase 4
- `LotsModal` receives `transactions` and filters by ticker — portfolio scoping is achieved by passing pre-filtered transactions from DashboardView; no changes needed to `LotsModal.tsx`
- L3 lesson applies: Supabase UPDATE policies need both `USING` and `WITH CHECK`
- L4 lesson applies: `Transaction.portfolio_id` typed as `string` (non-nullable) — the migration enforces NOT NULL after backfill

## What We're NOT Doing

- Transaction reassignment UI (user can delete + re-add to move a transaction between portfolios)
- Cross-portfolio LotsModal (LotsModal is scoped to the portfolio from which it was opened)
- Changes to `LotsModal.tsx`, `prices`/`sectors` tables, or the `computePositions` / `computePortfolioSummary` / `computeSectorAllocation` function signatures

## Implementation Approach

Four phases in strict dependency order: schema → portfolio CRUD API → transaction assignment → dashboard. Each phase is independently testable before starting the next.

**Per-portfolio analytics without changing `portfolio.ts`:** `DashboardView` partitions `transactions` by `portfolio_id` before passing each slice to `computePositions()`. The combined summary calls `computePositions(allTransactions, prices)` — the existing function, the existing behaviour.

**Portfolio CRUD security:** Supabase client operates under user RLS, auto-scoping portfolio queries. API routes additionally verify portfolio ownership before transaction inserts/updates (RLS alone does not validate FK targets).

## Critical Implementation Details

**`ON DELETE RESTRICT` on the FK**: the DB blocks deleting a portfolio that has transactions. The API layer adds an explicit count-check before attempting delete, returning 409 with a user-friendly message rather than surfacing a raw FK violation.

**Backfill migration must handle zero-transaction users**: the PL/pgSQL DO block iterates only over `DISTINCT user_id` values already in `transactions`. New users (no rows yet) are unaffected. The NOT NULL constraint is applied only after the loop completes.

---

## Phase 1: Schema Foundation

### Overview

Creates the `portfolios` table with RLS, adds `portfolio_id` to `transactions` with per-user backfill, and updates TypeScript types.

### Changes Required:

#### 1. Portfolios table migration

**File**: `supabase/migrations/20260613000000_create_portfolios.sql`

**Intent**: Define the portfolios table using the same access-control shape as transactions (four user-scoped RLS policies, updated_at trigger).

**Contract**: Columns: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100)`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. RLS enabled with SELECT / INSERT / UPDATE / DELETE policies scoped to `auth.uid() = user_id`. UPDATE policy must have both `USING (auth.uid() = user_id)` and `WITH CHECK (auth.uid() = user_id)` (L3). Trigger named `set_portfolios_updated_at` reuses `public.set_updated_at()` — do not redefine it. Index: `CREATE INDEX idx_portfolios_user_id ON public.portfolios(user_id)`.

#### 2. Add portfolio_id to transactions migration

**File**: `supabase/migrations/20260613000001_add_portfolio_id_to_transactions.sql`

**Intent**: Add a non-nullable portfolio_id FK to transactions, backfilling every existing row by auto-creating one "My Portfolio" per user.

**Contract**:
1. `ALTER TABLE public.transactions ADD COLUMN portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE RESTRICT;`
2. PL/pgSQL DO block: `FOR uid IN (SELECT DISTINCT user_id FROM public.transactions WHERE portfolio_id IS NULL)` — `INSERT INTO public.portfolios (user_id, name) VALUES (uid, 'My Portfolio') RETURNING id INTO pid` — `UPDATE public.transactions SET portfolio_id = pid WHERE user_id = uid AND portfolio_id IS NULL`
3. `ALTER TABLE public.transactions ALTER COLUMN portfolio_id SET NOT NULL;`
4. `CREATE INDEX idx_transactions_portfolio_id ON public.transactions(portfolio_id);`

#### 3. Portfolio TypeScript type

**File**: `src/types/portfolio.ts` (new)

**Intent**: TypeScript representation of a portfolios table row.

**Contract**: `Portfolio` interface with fields: `id: string`, `user_id: string`, `name: string`, `created_at: string`, `updated_at: string`. `NewPortfolio = Pick<Portfolio, "name">`.

#### 4. Update Transaction type

**File**: `src/types/transaction.ts`

**Intent**: Add portfolio_id to Transaction; NewTransaction inherits it automatically via the existing `Omit`.

**Contract**: Add `portfolio_id: string` to the `Transaction` interface (non-nullable — DB enforces NOT NULL after migration). `NewTransaction` and `UpdateTransaction` require no separate edits.

### Success Criteria:

#### Automated Verification:

- Migrations apply cleanly: `npx supabase db push`
- TypeScript compilation passes: `npm run build`

#### Manual Verification:

- Supabase Studio: `portfolios` table exists with expected columns; RLS enabled; 4 policies visible; UPDATE policy has both clauses
- Supabase Studio: `transactions.portfolio_id` column is NOT NULL on every row
- Supabase Studio: each distinct `user_id` in transactions has a corresponding "My Portfolio" row in portfolios

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Portfolio CRUD API

### Overview

Three new files deliver the full portfolio lifecycle: list, create, rename, and delete (blocked when transactions exist).

### Changes Required:

#### 1. Portfolio Zod schema

**File**: `src/lib/portfolio-schema.ts` (new)

**Intent**: Centralised validation for portfolio name — consumed by both POST and PUT routes.

**Contract**: `portfolioSchema = z.object({ name: z.string().min(1, "Name is required").max(100, "Name must be at most 100 characters") })`. Export `PortfolioFormValues = z.infer<typeof portfolioSchema>`.

#### 2. GET + POST /api/portfolios

**File**: `src/pages/api/portfolios/index.ts` (new)

**Intent**: List the current user's portfolios in creation order; create a named portfolio.

**Contract**:
- Both handlers: auth check → 401 if unauthenticated; Supabase client → 500 if unavailable. Follow the error-handling shape in `transactions/index.ts` throughout.
- GET: `supabase.from("portfolios").select("*").order("created_at", { ascending: true })` → 200 `{ data: Portfolio[] }`
- POST: parse body with `portfolioSchema` → 400 on validation failure; insert `{ user_id: context.locals.user.id, name: result.data.name }` with `.select().single()` → 201 `{ data: Portfolio }`. Constraint violation (code starts with "23") → 400; other DB error → 500.

#### 3. PUT + DELETE /api/portfolios/[id]

**File**: `src/pages/api/portfolios/[id].ts` (new)

**Intent**: Rename a portfolio; delete a portfolio only when it has no transactions.

**Contract**:
- UUID_RE validation on `context.params.id` (same constant pattern as `transactions/[id].ts`).
- PUT: auth check → UUID validate → parse body with `portfolioSchema` → `.update({ name }).eq("id", id).select().single()` (RLS scopes update to the owner) → 200 `{ data: Portfolio }`. PGRST116 → 404.
- DELETE: auth check → UUID validate → `supabase.from("transactions").select("*", { count: "exact", head: true }).eq("portfolio_id", id)` → if `(count ?? 0) > 0` return 409 `{ error: "This portfolio has transactions. Reassign or delete them first." }` → else `.delete().eq("id", id).select("id").single()` → 200 `{ success: true }`. PGRST116 → 404.

### Success Criteria:

#### Automated Verification:

- TypeScript compilation passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- `GET /api/portfolios` returns the user's portfolios array
- `POST /api/portfolios` with `{ "name": "Regular Investing" }` returns 201 with the created portfolio object
- `PUT /api/portfolios/<id>` renames the portfolio and returns 200
- `DELETE /api/portfolios/<id>` on a portfolio with transactions returns 409 with the block message
- `DELETE /api/portfolios/<id>` on a portfolio with no transactions returns 200

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Transaction Assignment

### Overview

Extends the transaction schema and form with a required `portfolio_id` field; updates both API routes to verify portfolio ownership before writing.

### Changes Required:

#### 1. Add portfolio_id to transaction Zod schema

**File**: `src/lib/transaction-schema.ts`

**Intent**: Require a valid UUID portfolio_id on every transaction create/update.

**Contract**: Add `portfolio_id: z.string().uuid("Invalid portfolio ID")` to the `transactionSchema` object. `TransactionFormValues` (inferred type) automatically includes it.

#### 2. Portfolio selector in AddTransactionForm

**File**: `src/components/transactions/AddTransactionForm.tsx`

**Intent**: Add a required portfolio picker so every transaction is assigned to a portfolio; default to the first portfolio for new transactions.

**Contract**:
- Props interface adds: `portfolios: Portfolio[]`, `defaultPortfolioId?: string`. Import `Portfolio` from `"@/types/portfolio"`.
- Default values: add `portfolio_id: transaction?.portfolio_id ?? defaultPortfolioId ?? portfolios[0]?.id ?? ""`.
- New field before the ticker field: a `Controller`-wrapped `Select` for `portfolio_id`, using the exact same pattern as the currency field (Controller → Select → SelectTrigger → SelectContent → SelectItem per portfolio). `value={portfolio.id}` label `{portfolio.name}`.
- Error display follows the existing `errors.<field>` pattern using `errors.portfolio_id`.

#### 3. Validate portfolio ownership in POST /api/transactions

**File**: `src/pages/api/transactions/index.ts`

**Intent**: Prevent assigning a transaction to a portfolio the authenticated user does not own (FK constraint alone does not check ownership).

**Contract**: After `transactionSchema.safeParse(body)` succeeds and before the insert: `const { data: portfolioRow } = await supabase.from("portfolios").select("id").eq("id", result.data.portfolio_id).maybeSingle()`. If `portfolioRow` is null → return 400 `{ error: "Portfolio not found" }`. The `portfolio_id` is already in `result.data`; the existing insert spread `[{ user_id: context.locals.user.id, ...result.data }]` includes it automatically.

#### 4. Validate portfolio ownership in PUT /api/transactions/[id]

**File**: `src/pages/api/transactions/[id].ts`

**Intent**: Same ownership check when editing and potentially reassigning a transaction's portfolio.

**Contract**: After `transactionSchema.safeParse(body)` succeeds and before the DB update: same `portfolios.select("id").eq("id", result.data.portfolio_id).maybeSingle()` check; return 400 `{ error: "Portfolio not found" }` if null. The existing `supabase.from("transactions").update(result.data)` spread covers `portfolio_id` automatically.

### Success Criteria:

#### Automated Verification:

- TypeScript compilation passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Add transaction form shows a portfolio selector above the ticker field; pre-selects the first portfolio
- Editing an existing transaction shows the transaction's current portfolio pre-selected; allows reassignment
- Submitting the form with an invalid/missing portfolio_id shows a validation error
- API: `POST /api/transactions` with an unknown `portfolio_id` UUID returns 400 "Portfolio not found"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Dashboard Restructure

### Overview

Introduces a `PortfolioSection` component for per-portfolio rendering, refactors `DashboardView` to manage portfolio CRUD state and render a combined summary + one section per portfolio, and updates `dashboard.astro` to pass portfolios alongside transactions.

### Changes Required:

#### 1. Add optional title to PortfolioSummaryCard

**File**: `src/components/portfolio/PortfolioSummaryCard.tsx`

**Intent**: Support rendering "All Portfolios" on the combined card without duplicating the component.

**Contract**: Add `title?: string` to the `Props` interface. Replace the hardcoded `"Portfolio Summary"` string in the h2 with `{title ?? "Portfolio Summary"}`.

#### 2. New PortfolioSection component

**File**: `src/components/portfolio/PortfolioSection.tsx` (new)

**Intent**: Render one portfolio as a named section (header with rename/delete, summary card, sortable table, sector chart). Extracting the table + sort logic here allows each portfolio section to have independent sort state.

**Contract**:
Props:
```
portfolio: Portfolio
transactions: Transaction[]   // pre-filtered to this portfolio by the caller
prices: Record<string, PriceData>
sectors: Record<string, string>
onAddTransaction: (portfolioId: string) => void
onEditPortfolio: (portfolio: Portfolio) => void
onDeletePortfolio: (portfolioId: string) => void
onShowLots: (ticker: string, portfolioId: string) => void
```
Internal state: `sortKey: SortKey`, `sortDir: "asc" | "desc"` — same `SortKey` union, `sortIcon`, `formatCurrentPrice`, `formatPriceDate` helpers moved from `DashboardView.tsx` to this file's module scope.

Internal memos: `positions` (computePositions), `summary` (computePortfolioSummary), `sectorSlices` (computeSectorAllocation), `sortedPositions`.

Render when `transactions.length > 0`:
1. Section header div: `<h2>` with portfolio.name; Pencil icon button → `onEditPortfolio(portfolio)`; Trash2 icon button → `onDeletePortfolio(portfolio.id)`
2. `<PortfolioSummaryCard summary={summary} />`
3. Overflow table — exact markup extracted from current DashboardView lines 174–278; row onClick calls `onShowLots(pos.ticker, portfolio.id)` instead of `setSelectedTicker`
4. Sector chart panel div with `<SectorAllocationChart slices={sectorSlices} />`
5. "Add transaction" button → `onAddTransaction(portfolio.id)`

Render when `transactions.length === 0`: section header + small empty state div ("No positions yet") + "Add transaction" button.

#### 3. Refactor DashboardView

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Replace the current single-portfolio render with a combined summary + per-portfolio PortfolioSection loop, plus inline portfolio CRUD dialogs.

**Contract**:

Props: add `initialPortfolios: Portfolio[]`.

State additions:
- `portfolios: Portfolio[]` — initialised from `initialPortfolios`
- `addTransactionPortfolioId: string | null` — replaces `isDialogOpen`; null means dialog closed
- `editPortfolio: Portfolio | null`
- `deletingPortfolio: { id: string; name: string } | null`
- `isDeletePortfolioLoading: boolean`
- `deletePortfolioError: string | null`
- `isAddPortfolioDialogOpen: boolean`
- `lotsContext: { ticker: string; portfolioId: string } | null` — replaces `selectedTicker`

State removals: `isDialogOpen`, `selectedTicker`.

Memo additions:
- `allPositions = useMemo(() => computePositions(transactions, prices), [transactions, prices])`
- `combinedSummary = useMemo(() => computePortfolioSummary(allPositions), [allPositions])`

Memo removals: `positions`, `sectorSlices`, `portfolioSummary`, `sortedPositions` (moved to PortfolioSection). Remove module-level `SortKey`, `sortIcon`, `formatCurrentPrice`, `formatPriceDate` (moved to PortfolioSection).

Toolbar: add "+ Add portfolio" button (opens `isAddPortfolioDialogOpen`) next to the sign out button.

Empty state: condition changes from `transactions.length === 0` to `portfolios.length === 0`. New copy: "No portfolios yet." + "Create your first portfolio" button (opens `isAddPortfolioDialogOpen`).

Render when portfolios exist:
1. `<PortfolioSummaryCard summary={combinedSummary} title="All Portfolios" />`
2. `portfolios.map(p => <PortfolioSection key={p.id} portfolio={p} transactions={transactions.filter(t => t.portfolio_id === p.id)} prices={prices} sectors={sectors} onAddTransaction={id => setAddTransactionPortfolioId(id)} onEditPortfolio={setEditPortfolio} onDeletePortfolio={id => setDeletingPortfolio({ id, name: portfolios.find(p => p.id === id)?.name ?? "" })} onShowLots={(ticker, portfolioId) => setLotsContext({ ticker, portfolioId })} />)`

LotsModal: `open={lotsContext !== null}`, `ticker={lotsContext?.ticker ?? ""}`, `transactions={transactions.filter(t => t.portfolio_id === lotsContext?.portfolioId)}`, `onOpenChange={(open) => { if (!open) setLotsContext(null); }}`.

Add transaction Dialog: `open={addTransactionPortfolioId !== null}`, `onOpenChange={(open) => { if (!open) setAddTransactionPortfolioId(null); }}`. AddTransactionForm receives `portfolios={portfolios}` and `defaultPortfolioId={addTransactionPortfolioId ?? undefined}`.

Edit transaction Dialog: AddTransactionForm receives `portfolios={portfolios}` (form reads `transaction.portfolio_id` for the default; existing `transaction` prop unchanged).

New dialogs to add (after existing dialog JSX):

- Add portfolio Dialog: `open={isAddPortfolioDialogOpen}`. Contains a name text input. On submit: `POST /api/portfolios` → on success append to `portfolios` state; close dialog.
- Rename portfolio Dialog: `open={editPortfolio !== null}`. Pre-fills name input with `editPortfolio.name`. On submit: `PUT /api/portfolios/${editPortfolio.id}` → on success replace the matching entry in `portfolios` state; close dialog.
- Delete portfolio AlertDialog: `open={deletingPortfolio !== null}`. On confirm: `DELETE /api/portfolios/${deletingPortfolio.id}` → 409 sets `deletePortfolioError` (display inline in dialog, same pattern as `deleteError` in the transaction delete dialog) → 200 removes from `portfolios` state; also sets `lotsContext` to null if it referenced that portfolio.

#### 4. Update dashboard.astro

**File**: `src/pages/dashboard.astro`

**Intent**: Fetch the user's portfolios and pass them to DashboardView alongside the existing transactions and prices.

**Contract**: After the transactions query, add: `const { data: portfoliosData } = supabase ? await supabase.from("portfolios").select("*").order("created_at", { ascending: true }) : { data: [] }`. Import `Portfolio` from `"@/types/portfolio"`. Add `initialPortfolios={(portfoliosData ?? []) as Portfolio[]}` prop to the `<DashboardView>` component.

### Success Criteria:

#### Automated Verification:

- TypeScript compilation passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Dashboard shows "All Portfolios" combined summary card at top
- Each portfolio renders as a named section with summary card, sortable table, and sector chart
- Each portfolio section sorts independently (sorting one doesn't affect another)
- "+ Add portfolio" in toolbar creates a new portfolio section
- Rename (pencil icon): dialog pre-fills current name; saving updates the section header
- Delete (trash icon) a portfolio with transactions: 409 error message displayed in dialog
- Delete (trash icon) a portfolio with no transactions: section disappears
- "Add transaction" button within a portfolio section pre-selects that portfolio in the form
- LotsModal opened from Portfolio A shows only Portfolio A's lots for that ticker
- Existing transactions appear under the "My Portfolio" section (backfilled)
- Adding, editing, and deleting transactions all continue to work correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Migration PL/pgSQL backfill: verify a user with 3 transactions ends up with 1 portfolio and all 3 transactions assigned to it
- Migration edge case: a user with no transactions gets no portfolio row

### Integration Tests:

- Full flow: create portfolio → add transaction to it → verify transaction appears in that portfolio's table → delete portfolio (blocked) → delete transaction → delete portfolio (succeeds)
- Portfolio ownership: verify `POST /api/transactions` with another user's portfolio_id returns 400

### Manual Testing Steps:

1. Log in as a user with existing transactions; confirm they appear under "My Portfolio"
2. Create a second portfolio named "Retiring"; add a transaction to it
3. Confirm each portfolio's table shows only its own positions; sector charts are separate
4. Confirm "All Portfolios" summary matches the sum of both portfolios
5. Open LotsModal for a ticker in "Regular Investing"; confirm only that portfolio's lots appear
6. Attempt to delete "My Portfolio" (has transactions) — verify 409 message
7. Delete a newly-created empty portfolio — verify it disappears
8. Edit a transaction and reassign it to a different portfolio; verify it moves sections on the next render

## Performance Considerations

`transactions.filter(t => t.portfolio_id === p.id)` is called once per portfolio per render. For the typical 2–3 portfolio case with up to 500 transactions (the current dashboard query limit), this is negligible. No memoization of the filter result is needed.

## Migration Notes

`20260613000001` is a one-shot migration: it adds the column, backfills, then sets NOT NULL. If the migration is run on a fresh database with no transactions, the DO block is a no-op and the NOT NULL constraint applies immediately to the empty table. The migration is not reversible without a separate rollback migration.

## References

- Related frame brief: `context/changes/dual-portfolio-view/frame.md`
- Schema pattern: `supabase/migrations/20260604111725_create_transactions.sql`
- API route pattern: `src/pages/api/transactions/[id].ts`
- Analytics lib: `src/lib/portfolio.ts`
- Dashboard entry: `src/pages/dashboard.astro`, `src/components/transactions/DashboardView.tsx`
- Existing summary card: `src/components/portfolio/PortfolioSummaryCard.tsx`
- Existing sector chart: `src/components/portfolio/SectorAllocationChart.tsx`
- Lots modal: `src/components/transactions/LotsModal.tsx`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema Foundation

#### Automated

- [x] 1.1 Migrations apply cleanly: `npx supabase db push` — 85641b4
- [x] 1.2 TypeScript compilation passes: `npm run build` — 85641b4

#### Manual

- [x] 1.3 Supabase Studio: portfolios table structure and RLS policies correct — 85641b4
- [x] 1.4 Supabase Studio: transactions.portfolio_id is NOT NULL on all rows — 85641b4
- [x] 1.5 Supabase Studio: existing transactions assigned to a "My Portfolio" row per user — 85641b4

### Phase 2: Portfolio CRUD API

#### Automated

- [x] 2.1 TypeScript compilation passes: `npm run build` — 91aae4c
- [x] 2.2 Lint passes: `npm run lint` — 91aae4c

#### Manual

- [x] 2.3 GET /api/portfolios returns portfolios array — 91aae4c
- [x] 2.4 POST /api/portfolios creates and returns a portfolio (201) — 91aae4c
- [x] 2.5 PUT /api/portfolios/[id] renames portfolio (200) — 91aae4c
- [x] 2.6 DELETE /api/portfolios/[id] with transactions returns 409 — 91aae4c
- [x] 2.7 DELETE /api/portfolios/[id] with no transactions returns 200 — 91aae4c

### Phase 3: Transaction Assignment

#### Automated

- [x] 3.1 TypeScript compilation passes: `npm run build` — 7776689
- [x] 3.2 Lint passes: `npm run lint` — 7776689

#### Manual

- [x] 3.3 Add transaction form shows portfolio selector; pre-selects first portfolio — 7776689
- [x] 3.4 Edit transaction form shows current portfolio; allows reassignment — 7776689
- [x] 3.5 POST /api/transactions with unknown portfolio_id returns 400 — 7776689

### Phase 4: Dashboard Restructure

#### Automated

- [x] 4.1 TypeScript compilation passes: `npm run build` — b546ac5
- [x] 4.2 Lint passes: `npm run lint` — b546ac5

#### Manual

- [x] 4.3 Dashboard shows "All Portfolios" combined summary card at top — b546ac5
- [x] 4.4 Each portfolio renders as a named section with summary, table, and chart — b546ac5
- [x] 4.5 Portfolio sections sort independently — b546ac5
- [x] 4.6 Add portfolio, rename portfolio, and delete portfolio (with and without transactions) all work correctly — b546ac5
- [x] 4.7 Add transaction button in each section pre-selects that portfolio — b546ac5
- [x] 4.8 LotsModal is scoped to the portfolio from which it was opened — b546ac5
- [x] 4.9 No regressions in transaction add, edit, and delete flows — b546ac5
