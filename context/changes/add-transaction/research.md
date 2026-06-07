---
date: 2026-06-06T00:00:00+00:00
researcher: Claude Sonnet 4.6
git_commit: 9d68e363ad6364abff931bff3901f127c3fbf9c4
branch: add-transaction
repository: Pholio
topic: "Add Transaction — codebase patterns for form, API route, data layer, and UI"
tags: [research, codebase, add-transaction, forms, api-routes, supabase, tailwind]
status: complete
last_updated: 2026-06-06
last_updated_by: Claude Sonnet 4.6
---

# Research: Add Transaction

**Date**: 2026-06-06
**Researcher**: Claude Sonnet 4.6
**Git Commit**: 9d68e363ad6364abff931bff3901f127c3fbf9c4
**Branch**: add-transaction
**Repository**: Pholio

## Research Question

What patterns exist in the codebase for forms, API routes, Supabase data access, and UI layout that a new "add transaction" feature must follow?

## Summary

The codebase has a consistent, custom-built pattern across all four areas. Forms use native HTML POST with React state-only validation. API routes read `formData()` and redirect on success/error. Supabase inserts require the user_id from `context.locals.user` (set by middleware). The dashboard is a bare Astro page ready to receive a transaction list and form. Only one shadcn component (Button) is installed — the form will need a native `<select>` for currency and a custom input pattern following `FormField.tsx`.

---

## Detailed Findings

### 1. Form Component Pattern

**Location**: `src/components/auth/` — 6 files, all relevant as the canonical form pattern.

**Architecture**: No form library (no react-hook-form, zod, formik). Everything is manual `useState`.

**State shape** (`SignInForm.tsx:13-16`, `SignUpForm.tsx:15-20`):
```typescript
const [email, setEmail] = useState("");
const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
```
- One `useState` per field
- One `errors` object with optional keys per field

**Validation** (`SignInForm.tsx:18-30`):
- `validate()` function builds error object, returns `false` if any invalid
- Client-side only — prevents submit, does not duplicate server logic
- Pattern: `if (!email) newErrors.email = "Email is required"`

**Error clearing on change** (`SignInForm.tsx:32-34`):
```typescript
function clearError(field: keyof typeof errors) {
  if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
}
```
Called on every `onChange` handler.

**Form submission** (`SignInForm.tsx:36-43`):
- Native `<form method="POST" action="/api/auth/signin" onSubmit={handleSubmit} noValidate>`
- `handleSubmit` calls `e.preventDefault()` + `validate()` — if invalid, stops; otherwise lets form submit natively
- **No `fetch()` call in the component** — form posts natively, server redirects handle success/error

**Loading state** (`SubmitButton.tsx:12`):
```typescript
const { pending } = useFormStatus();
```
React 19 `useFormStatus()` — no manual `isLoading` state needed. The `SubmitButton` is a separate component because `useFormStatus()` must be inside the `<form>`.

**Error display**:
- Field-level: `FormField.tsx:58-65` — red border + `CircleAlert` icon + red text below input
- Server-level: `ServerError.tsx` — full-width red card above submit button, receives `?error=` query param from server redirect

**Shared UI pieces**:
- `FormField.tsx` — label + input + error/hint; no shadcn Input used
- `SubmitButton.tsx` — wraps shadcn `Button` + `useFormStatus()` spinner
- `ServerError.tsx` — server error banner, reads `?error=` from URL

**No shadcn Input/Label/Select installed** — `src/components/ui/` contains only `button.tsx` and `LibBadge.astro`.

---

### 2. API Route Pattern

**Location**: `src/pages/api/auth/` — 4 files.

**Canonical pattern** (all POST routes):
```typescript
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();   // parse formData, not JSON
  const field = form.get("field") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/some-page?error=${encodeURIComponent("Service unavailable")}`);
  }

  const { error } = await supabase.from("table").insert([{ ... }]);
  if (error) {
    return context.redirect(`/some-page?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/dashboard");
};
```

Key points:
- **`formData()` not JSON** — matches native form submit from React component (`signin.ts:5`)
- **`createClient(context.request.headers, context.cookies)`** — exact call signature (`signin.ts:9`)
- **Null check on supabase** — if env vars missing, redirect with error (`signin.ts:10-12`)
- **Redirect on both success and error** — no JSON responses in existing routes
- **Error format**: `?error={encodeURIComponent(error.message)}` in query param (`signin.ts:16`)
- **No server-side validation beyond null checks** — client form validates; server trusts it

**For the transaction route**, the same pattern applies. The key addition is reading `context.locals.user` for the `user_id`:
```typescript
const user = context.locals.user;
// user_id is user.id — RLS enforces isolation but we must supply it on INSERT
```

**Middleware** (`src/middleware.ts`):
- Resolves `context.locals.user` via `supabase.auth.getUser()` before any route handler runs
- Protects `/dashboard` — unauthenticated users redirect to `/auth/signin`
- `context.locals.user` is `import("@supabase/supabase-js").User | null` (`src/env.d.ts:3`)

---

### 3. Data Layer

**Transaction types** (`src/types/transaction.ts`):
```typescript
type Currency = "PLN" | "USD" | "EUR" | "GBP" | "CHF" | "CAD" | "AUD" | "JPY" | "DKK" | "NOK" | "SEK";  // line 1

interface Transaction {  // lines 3-13
  id: string;
  user_id: string;
  ticker: string;
  purchase_price: number;
  purchase_date: string;   // ISO date string "YYYY-MM-DD"
  currency: Currency;
  shares: number;
  created_at: string;
  updated_at: string;
}

type NewTransaction = Omit<Transaction, "id" | "user_id" | "created_at" | "updated_at">;  // line 15
type UpdateTransaction = Partial<NewTransaction>;  // line 17
```

**Supabase client** (`src/lib/supabase.ts:5`):
```typescript
createClient(requestHeaders: Headers, cookies: AstroCookies): SupabaseClient | null
```
Returns `null` if `SUPABASE_URL` or `SUPABASE_KEY` are missing — always null-check before use.

**Insert pattern** (derived from auth routes + schema):
```typescript
const { error } = await supabase
  .from("transactions")
  .insert([{
    user_id: context.locals.user.id,
    ticker,
    purchase_price: parseFloat(purchase_price),
    purchase_date,
    currency,
    shares: parseFloat(shares),
  }]);
```
`purchase_price` and `shares` arrive as strings from formData — must be `parseFloat()` before insert (DB column is `NUMERIC(15,4)`).

**SQL schema** (`supabase/migrations/20260604111725_create_transactions.sql`):
| Column | Type | Constraint |
|---|---|---|
| id | UUID | PK, gen_random_uuid() |
| user_id | UUID | FK auth.users, CASCADE |
| ticker | TEXT | NOT NULL |
| purchase_price | NUMERIC(15,4) | NOT NULL, > 0 |
| purchase_date | DATE | NOT NULL |
| currency | TEXT | NOT NULL, CHECK IN list |
| shares | NUMERIC(15,4) | NOT NULL, > 0 |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | DEFAULT now(), auto-trigger |

RLS active — 4 policies (SELECT/INSERT/UPDATE/DELETE scoped to `auth.uid() = user_id`).

**Dashboard page** (`src/pages/dashboard.astro`):
- Currently renders: user email welcome, sign-out button, no transaction data
- `const { user } = Astro.locals;` at line 4 — user available server-side
- Ready to add: Supabase query in frontmatter + table/list component below sign-out
- Server-side fetch pattern for list: create client in frontmatter, query `.from("transactions").select("*").order("purchase_date", { ascending: false })`

---

### 4. UI Components and Layout

**Layout system** (`src/layouts/Layout.astro`):
- Single shared layout — all pages use `<Layout title="..."><content /></Layout>`
- Renders `<slot />` for page content
- Provides global CSS, error banners for missing config

**Import alias**: `@/` → `./src/` (configured in `tsconfig.json:8-11` and `components.json:13-18`)

**Tailwind conventions** (consistent across all pages):
- **Backgrounds**: `bg-white/5`, `bg-white/10` glass cards with `backdrop-blur-xl`
- **Borders**: `border border-white/10`, `border-white/20`
- **Text**: `text-blue-100`, `text-white/80`, gradient `from-blue-200 to-purple-200 bg-clip-text text-transparent`
- **Accents**: `bg-purple-600 hover:bg-purple-500` for primary buttons
- **Cards**: `rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl`
- **Errors**: `border-red-400/60`, `text-red-300`, `bg-red-900/30`

**Installed shadcn components**: Only `button.tsx` (`src/components/ui/button.tsx`) — CVA variants (default, destructive, outline, secondary, ghost, link).

**Topbar**: Lives in `Welcome.astro` (home page only), not on dashboard or auth pages.

**Auth page structure** (`src/pages/auth/signin.astro`):
```astro
<Layout title="Sign in">
  <div class="flex min-h-screen items-center justify-center ...">
    <div class="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
      <h1 class="gradient-text ...">Sign in</h1>
      <SignInForm client:load />
    </div>
  </div>
</Layout>
```
Transaction form page should follow the same centering + glass card pattern.

---

## Architecture Insights

**Form → API → DB flow (native, no fetch)**:
1. React form component manages state + client-side validation
2. On valid submit, native `<form method="POST" action="/api/transactions">` submits
3. API route reads `formData()`, inserts to Supabase, redirects to `/dashboard?success=1` or `/transactions/add?error=...`
4. Dashboard fetches transactions in Astro frontmatter server-side and renders list

**Currency select**: No shadcn Select installed. Use native `<select>` styled with Tailwind to match `FormField.tsx` input styling. Follow the same border/focus/error pattern as `inputBase` CSS.

**Date input**: Native `<input type="date">` — styled to match FormField inputs. Note: date value from formData is already a string in `"YYYY-MM-DD"` format — no conversion needed for DB insert.

**`parseFloat` requirement**: `purchase_price` and `shares` come from formData as strings. DB NUMERIC columns need numeric types — always `parseFloat()` in the API route before insert.

**Double quotes rule** (lessons.md L3): All TypeScript files must use double quotes — Prettier/ESLint enforces it. Single quotes cause CI failure.

---

## Historical Context

- `context/archive/2026-06-03-transactions-schema/plan.md` — Full schema definition, RLS policies, TypeScript types. Foundation for this change. Key finding: `NewTransaction` type is ready to use; no schema changes needed for S-02.
- `context/archive/2026-06-04-auth-flow-complete/plan.md` — Auth route patterns, middleware structure, `emailRedirectTo` derivation from request URL. Confirms: `context.locals.user` is available in all protected routes.
- `context/foundation/lessons.md` L1 — Use text env vars (not wrangler secrets) for `astro:env/server`. Applies if FINNHUB_API_KEY is added via `astro:env/server` in S-03.
- `context/foundation/lessons.md` L3 — Double quotes in all TypeScript files. Critical for CI.

---

## Open Questions

1. **Form location**: Should the add-transaction form live on the dashboard page (inline) or on a separate `/transactions/add` page? The roadmap says the transaction "appears in the list" after adding — a redirect to dashboard after POST satisfies this. Separate page is cleaner; inline is simpler. Recommend separate page to keep dashboard focused on the list view.

2. **Transaction list on dashboard**: The list needs to be fetched server-side in `dashboard.astro` frontmatter using the Supabase client. No pattern for this exists yet in the codebase — it's the first server-side data fetch outside auth. The approach is straightforward: `createClient(Astro.request.headers, Astro.cookies)` + `.from("transactions").select("*")`.

3. **Empty state**: The auth-flow-complete plan explicitly deferred "Dashboard empty-state with transaction prompt" to S-02. This change should deliver it — a CTA to add the first transaction when the list is empty.

4. **Native select styling**: No shadcn Select is installed. Styling a native `<select>` to match the glass-morphism theme requires custom CSS or inline Tailwind. The `appearance-none` utility removes browser default styling. This is the only visual gap — everything else is covered by existing patterns.
