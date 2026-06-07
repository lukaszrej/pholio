# Add Transaction — Implementation Plan

## Overview

Add the ability for authenticated users to record stock purchase transactions. A modal dialog on the dashboard contains a validated form (react-hook-form + zod + shadcn) that POSTs to a new JSON API route. On success the transaction is appended to a React-managed list — no page reload needed. This is S-02 and unlocks the North Star feature S-03 (portfolio ROI view).

## Current State Analysis

- `src/pages/dashboard.astro` — renders a welcome message and sign-out button; no transaction data fetched, no form
- `src/types/transaction.ts` — `Transaction`, `NewTransaction`, `UpdateTransaction`, `Currency` all exist and are correct; no changes needed
- `supabase/migrations/20260604111725_create_transactions.sql` — `transactions` table live with RLS; 4 policies enforce user isolation
- `src/lib/supabase.ts` — `createClient(requestHeaders, cookies)` returns client or `null`; null-check required everywhere
- `src/components/ui/` — only `button.tsx` installed; Input, Label, Select, Dialog not yet available
- `src/middleware.ts` — `PROTECTED_ROUTES = ["/dashboard"]`; `/api/transactions` is NOT protected; the API route must do its own auth check
- `context.locals.user` — set by middleware for all routes via `supabase.auth.getUser()`; will be `null` for unauthenticated requests to the API

## Desired End State

- Logged-in user clicks "Add transaction" on dashboard → modal opens
- Fills in ticker, price, date, currency, shares → form validates client-side with zod
- Submits → POST to `/api/transactions` → server validates + inserts → returns created row
- Modal closes; new row appears at top of table instantly (optimistic update via React state)
- Dashboard shows empty state with CTA when no transactions exist

### Verify:
1. `npx astro check` passes with zero errors
2. `npm run lint` passes
3. Signed-in user can add a transaction and immediately see it in the table without a page reload
4. Duplicate/invalid submissions show field-level error messages
5. Unauthenticated POST to `/api/transactions` returns HTTP 401 JSON

### Key Discoveries:

- `context.locals.user.id` is the `user_id` for inserts — RLS enforces isolation server-side but we must supply it explicitly on INSERT
- Supabase `.insert([...]).select().single()` returns the created row — required for the optimistic update to work
- `z.coerce.number()` is needed in the zod schema for `purchase_price` and `shares` since HTML number inputs submit strings via fetch JSON
- shadcn components use CSS variables from `@layer base` (defined in `global.css`) — verify dark-theme rendering after install
- The transaction list must be a React component (not static Astro HTML) to support optimistic state updates after modal submit
- `createClient(Astro.request.headers, Astro.cookies)` in the dashboard frontmatter is the first server-side data fetch pattern in the app outside auth
- RLS handles user filtering automatically; `.select("*")` without `.eq("user_id", ...)` is correct and sufficient

## What We're NOT Doing

- No ticker validation against an external API — KISS per PRD §FR-004, deferred to v2
- No edit or delete on the transaction rows — S-04 scope
- No ROI or current price column — S-03 scope
- No currency conversion — FR-009 is parked (v2)
- No soft-delete or undo — hard delete chosen in PRD §FR-006; not in this change
- No pagination — MVP portfolio is small; simple full list is sufficient

## Implementation Approach

Four sequential phases. Phases 1–2 are infrastructure (dependencies, shadcn, API). Phases 3–4 are UI (form component, dashboard integration). Each phase is independently verifiable before the next begins.

The shared zod schema (`src/lib/transaction-schema.ts`) bridges client validation and server validation — same rules applied in both places, no duplication.

## Critical Implementation Details

**Auth check in API route** — `/api/transactions` is not in middleware's `PROTECTED_ROUTES`. An unauthenticated POST will reach the route handler with `context.locals.user === null`. The route must check this and return `new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })` before touching Supabase.

**Supabase insert + returning** — use `.insert([{ ... }]).select().single()` to get the created row back in one round-trip. The returned row is the `Transaction` object passed to `onSuccess` for the optimistic update. Without `.select()`, the insert returns no data and the optimistic update cannot work.

**Zod coerce for numeric fields** — `purchase_price` and `shares` are sent as numbers in the JSON body (react-hook-form serialises `type="number"` inputs as numbers). Use `z.coerce.number().positive()` to accept either string or number input and enforce the > 0 constraint. Do NOT use `parseFloat` manually; let zod handle coercion.

**Dialog controlled state** — use shadcn Dialog in controlled mode (`open={isDialogOpen}` + `onOpenChange={setIsDialogOpen}`) so `DashboardView` can close it programmatically after a successful submit. Uncontrolled mode cannot be closed from outside the Dialog.

**Double quotes in all TS files** — Prettier/ESLint enforces double quotes; single quotes fail CI (lessons.md L3).

---

## Phase 1: Dependencies + shadcn components + shared schema

### Overview

Install react-hook-form, zod, and four shadcn components (Input, Label, Select, Dialog). Write the shared zod validation schema. No application behaviour changes yet — only infrastructure.

### Changes Required:

#### 1. Install npm dependencies

**Command**: `npm install react-hook-form @hookform/resolvers zod`

**Intent**: Add the three packages required by shadcn Form. These are peer dependencies that shadcn Form expects but does not install automatically.

#### 2. Install shadcn components

**Command**: `npx shadcn add input label select dialog`

**Intent**: Install the four shadcn primitives the transaction form and modal need. Each generates a file under `src/components/ui/`.

**Contract**: After install, `src/components/ui/` must contain: `input.tsx`, `label.tsx`, `select.tsx`, `dialog.tsx` (and any auto-generated helper files shadcn creates).

#### 3. Create shared zod schema

**File**: `src/lib/transaction-schema.ts` *(new file)*

**Intent**: Define the zod schema for a new transaction once, importable by both the React form (client-side validation) and the API route (server-side validation). This prevents validation logic duplication.

**Contract**: Export `transactionSchema` (a `z.ZodObject`) and `TransactionFormValues` (inferred type). The schema must enforce:
- `ticker` — non-empty string, trimmed and uppercased via `.transform()`
- `purchase_price` — `z.coerce.number().positive()`
- `purchase_date` — non-empty string (date inputs provide `"YYYY-MM-DD"` format)
- `currency` — `z.enum([...])` matching the 11 values in the `Currency` union from `src/types/transaction.ts`
- `shares` — `z.coerce.number().positive()`

Also export `CURRENCIES` as a `const` array — the Select component needs to iterate it to render options.

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes with zero errors
- `npm run build` succeeds (shadcn components install without breaking the build)
- `npm run lint` passes

#### Manual Verification:

- `src/components/ui/input.tsx`, `label.tsx`, `select.tsx`, `dialog.tsx` all exist
- `src/lib/transaction-schema.ts` exists and exports `transactionSchema` and `CURRENCIES`
- No visible console errors or broken styles on the dashboard page

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 2: POST /api/transactions route

### Overview

Create the API endpoint that receives new transaction data, validates it server-side, inserts to Supabase, and returns the created row as JSON.

### Changes Required:

#### 1. Create transactions API route

**File**: `src/pages/api/transactions/index.ts` *(new file)*

**Intent**: Handle POST requests to `/api/transactions`. Validate the request body against the shared zod schema, check authentication, insert the transaction, and return the created row — or a descriptive error.

**Contract**: POST handler. Steps in order:
1. Check `context.locals.user` — if `null`, return `Response` with status 401 and JSON body `{ error: "Unauthorized" }`
2. Parse body: `await context.request.json()`
3. Validate with `transactionSchema.safeParse(body)` — if invalid, return status 400 with `{ error: result.error.issues[0].message }`
4. Create Supabase client via `createClient(context.request.headers, context.cookies)` — if null, return status 500 with `{ error: "Service unavailable" }`
5. Insert: `supabase.from("transactions").insert([{ user_id: context.locals.user.id, ...result.data }]).select().single()`
6. If Supabase returns an error, return status 400 with `{ error: dbError.message }`
7. On success, return status 201 with `{ data: insertedRow }`

All `Response` objects must set `Content-Type: application/json` header.

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes
- `npm run lint` passes

#### Manual Verification:

- Authenticated POST with valid JSON body → returns HTTP 201 with the created transaction
- Unauthenticated POST → returns HTTP 401 `{ error: "Unauthorized" }`
- POST with invalid body (e.g. negative price) → returns HTTP 400 with a descriptive error message
- New row visible in Supabase Dashboard → Table Editor → `transactions`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 3: AddTransactionForm React component

### Overview

Build the form component using react-hook-form, the shared zod schema, and shadcn Input/Label/Select. The component accepts callbacks — it does not manage dialog open/close state itself.

### Changes Required:

#### 1. Create transactions components directory

**Directory**: `src/components/transactions/` *(new directory)*

**Intent**: Group all transaction-related React components in one place, separate from auth components.

#### 2. Create AddTransactionForm component

**File**: `src/components/transactions/AddTransactionForm.tsx` *(new file)*

**Intent**: Render a validated form with five fields (ticker, purchase date, purchase price, currency, shares). On successful submit, fetch POST to `/api/transactions` and invoke the `onSuccess` callback with the returned transaction. On server error, display an error message inside the form.

**Contract**: 
- Props: `onSuccess: (transaction: Transaction) => void`, `onCancel: () => void`
- Uses `useForm<TransactionFormValues>` with `zodResolver(transactionSchema)`
- Five `FormField` items from shadcn Form, each wrapping the appropriate shadcn primitive:
  - `ticker` → `Input` (type="text", placeholder e.g. "AAPL")
  - `purchase_date` → `Input` (type="date")
  - `purchase_price` → `Input` (type="number", step="0.0001", min="0")
  - `shares` → `Input` (type="number", step="0.0001", min="0")
  - `currency` → `Select` with one `SelectItem` per entry in `CURRENCIES`
- Submit handler: `form.handleSubmit(async (values) => { ... })`:
  1. `fetch("/api/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) })`
  2. If `!response.ok`, parse error JSON and set a form-level error via `form.setError("root", { message: ... })`
  3. If `response.ok`, parse `{ data }` and call `onSuccess(data)`
- Show `form.formState.errors.root?.message` as a server error banner above the submit button
- Submit button disabled and shows spinner while `form.formState.isSubmitting`
- Import `Transaction` from `@/types/transaction`; import schema/types from `@/lib/transaction-schema`

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes
- `npm run lint` passes

#### Manual Verification:

- Submitting with empty fields shows field-level validation errors without a network request
- Submitting with valid data triggers a POST request visible in browser DevTools Network tab
- A server error (e.g. manually break the API) shows the error message inside the form
- Form is disabled and shows a spinner during submission

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 4: Dashboard integration

### Overview

Create the `DashboardView` React component that orchestrates the transaction table, empty state, and dialog. Update `dashboard.astro` to fetch transactions server-side and render `DashboardView` with them as initial props.

### Changes Required:

#### 1. Create DashboardView component

**File**: `src/components/transactions/DashboardView.tsx` *(new file)*

**Intent**: Own the dashboard's interactive state — dialog open/close and the transaction list — so transactions can be appended after a successful add without a page reload.

**Contract**:
- Props: `initialTransactions: Transaction[]`
- State: `transactions` (initialized from `initialTransactions`), `isDialogOpen` (boolean, starts `false`)
- Renders a toolbar: page heading + "Add transaction" Button that sets `isDialogOpen(true)`
- Renders a shadcn Dialog (controlled: `open={isDialogOpen}` + `onOpenChange={setIsDialogOpen}`):
  - `DialogContent` wraps `AddTransactionForm`
  - `onSuccess` handler: prepend the new transaction to `transactions` state, then set `isDialogOpen(false)`
  - `onCancel` handler: set `isDialogOpen(false)`
- **When `transactions.length === 0`** (empty state): render a centered message (e.g. "No transactions yet") with a Button that opens the dialog — same button, different placement
- **When `transactions.length > 0`**: render a table with columns: Ticker, Shares, Purchase Price, Currency, Date (ordered as returned from server, newest first)
  - Ticker in uppercase
  - Purchase price formatted to 2 decimal places
  - Shares formatted to 4 decimal places (allows fractional shares)
  - Date displayed as-is (`"YYYY-MM-DD"` from DB)
- Apply glass-morphism table styling consistent with the rest of the UI (`border border-white/10 bg-white/5 backdrop-blur-xl`)
- Import `Transaction` from `@/types/transaction`

#### 2. Update dashboard.astro

**File**: `src/pages/dashboard.astro`

**Intent**: Fetch the authenticated user's transactions from Supabase in the page frontmatter and pass them to `DashboardView` as initial props, replacing the current placeholder content.

**Contract**:
- In frontmatter: after `const { user } = Astro.locals`, create a Supabase client and query:
  ```typescript
  const supabase = createClient(Astro.request.headers, Astro.cookies);
  const transactions = supabase
    ? (await supabase.from("transactions").select("*").order("purchase_date", { ascending: false })).data ?? []
    : [];
  ```
- Replace the current welcome/sign-out placeholder with `<DashboardView client:load initialTransactions={transactions} />`
- Keep the `<Layout title="Dashboard">` wrapper
- Remove the inline sign-out button — sign-out should move inside `DashboardView` or the existing Topbar (see note below)

**Note on sign-out**: The current dashboard has an inline sign-out form. `DashboardView` does not manage auth. Keep the sign-out form in the Astro page above or below `DashboardView`, or add a simple sign-out link in the page header. Do not remove sign-out functionality.

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes
- `npm run lint` passes

#### Manual Verification:

- New user (no transactions): dashboard shows empty state with "Add transaction" CTA button
- Click "Add transaction" → modal opens with the form
- Fill and submit valid data → modal closes, new row appears in table immediately (no reload)
- Refresh the page → same transaction still appears (confirming it was persisted)
- Multiple transactions display in date-descending order
- Sign-out still works after the dashboard update

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding.

---

## Testing Strategy

### Manual Testing Steps:

1. Sign in with a test account that has no transactions → verify empty state with CTA
2. Click "Add transaction" → verify modal opens
3. Submit empty form → verify field-level validation errors appear (no network request)
4. Submit with ticker `aapl` → verify it appears as `AAPL` in the table (transform)
5. Submit with negative price → verify validation error
6. Submit valid data → verify modal closes, row appears at top of table
7. Refresh page → verify transaction persists
8. Open Supabase Dashboard → Table Editor → `transactions` → verify the row exists with correct `user_id`
9. In DevTools, copy the auth session cookie and make a raw `curl` POST to `/api/transactions` with a different user's data → verify RLS prevents cross-user access
10. Sign out and attempt `curl` POST to `/api/transactions` without session → verify 401

## Performance Considerations

No performance concerns at MVP scale (personal portfolio, <50 positions). Server-side fetch on dashboard load adds one Supabase round-trip — acceptable.

## Migration Notes

No schema changes. The `transactions` table was created in F-01. No data migration needed.

## References

- Research: `context/changes/add-transaction/research.md`
- Transactions schema: `context/archive/2026-06-03-transactions-schema/plan.md`
- Auth patterns: `context/archive/2026-06-04-auth-flow-complete/plan.md`
- PRD: `context/foundation/prd.md` §FR-004
- Roadmap: `context/foundation/roadmap.md` S-02
- Lessons: `context/foundation/lessons.md` (L3: double quotes in TS files)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Dependencies + shadcn components + shared schema

#### Automated

- [x] 1.1 `npx astro check` passes with zero errors — 7a05c9f
- [x] 1.2 `npm run build` succeeds — 7a05c9f
- [x] 1.3 `npm run lint` passes — 7a05c9f

#### Manual

- [ ] 1.4 `src/components/ui/input.tsx`, `label.tsx`, `select.tsx`, `dialog.tsx` all exist
- [ ] 1.5 `src/lib/transaction-schema.ts` exists and exports `transactionSchema` and `CURRENCIES`
- [ ] 1.6 No visible console errors or broken styles on the dashboard page

### Phase 2: POST /api/transactions route

#### Automated

- [x] 2.1 `npx astro check` passes — 8b47c20
- [x] 2.2 `npm run lint` passes — 8b47c20

#### Manual

- [x] 2.3 Authenticated POST with valid JSON body returns HTTP 201 with created transaction — 8b47c20
- [x] 2.4 Unauthenticated POST returns HTTP 401 `{ error: "Unauthorized" }` — 8b47c20
- [x] 2.5 POST with invalid body returns HTTP 400 with descriptive error message — 8b47c20
- [x] 2.6 New row visible in Supabase Dashboard → Table Editor → `transactions` — 8b47c20

### Phase 3: AddTransactionForm React component

#### Automated

- [x] 3.1 `npx astro check` passes — ee3928c
- [x] 3.2 `npm run lint` passes — ee3928c

#### Manual

- [x] 3.3 Empty form submit shows field-level validation errors without a network request — ee3928c
- [x] 3.4 Valid submit triggers POST visible in DevTools Network tab — ee3928c
- [x] 3.5 Server error displays inside the form as an error message — ee3928c
- [x] 3.6 Form is disabled with spinner during submission — ee3928c

### Phase 4: Dashboard integration

#### Automated

- [x] 4.1 `npx astro check` passes
- [x] 4.2 `npm run lint` passes

#### Manual

- [x] 4.3 New user sees empty state with "Add transaction" CTA
- [x] 4.4 Modal opens on CTA click; closes after successful submit
- [x] 4.5 New transaction row appears immediately after submit (no reload)
- [x] 4.6 Page refresh shows the same persisted transaction
- [x] 4.7 Multiple transactions display newest first
- [x] 4.8 Sign-out works after dashboard update
