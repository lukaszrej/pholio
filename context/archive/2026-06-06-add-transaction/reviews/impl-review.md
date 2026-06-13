<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Add Transaction

- **Plan**: context/changes/add-transaction/plan.md
- **Scope**: All phases (1–4)
- **Date**: 2026-06-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 3 warnings 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — API routes excluded from middleware auth guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:4 / src/pages/api/transactions/index.ts:9
- **Detail**: PROTECTED_ROUTES only covers /dashboard. /api/transactions does its own context.locals.user check correctly today, but any future API route that forgets the manual check has no middleware safety net.
- **Fix Applied**: Added PROTECTED_API_ROUTES = ["/api/"] to middleware.ts with a JSON 401 branch for API paths (distinct from page redirect). Per-route check in index.ts retained as defense-in-depth.
- **Decision**: FIXED via Fix A

### F2 — DB errors always mapped to HTTP 400

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/transactions/index.ts:50
- **Detail**: Supabase insert errors always returned 400 regardless of cause. Constraint violations are legitimately 400 but connection/server failures are 5xx.
- **Fix Applied**: Added `const status = dbError.code?.startsWith("23") ? 400 : 500` in the dbError branch. Also updated the type cast to include `code?: string`.
- **Decision**: FIXED

### F3 — purchase_date accepts any non-empty string

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/transaction-schema.ts:11
- **Detail**: Schema used z.string().min(1) only. Invalid date strings passed client validation and reached Postgres, which returned an opaque error.
- **Fix Applied**: Added `.regex(/^\d{4}-\d{2}-\d{2}$/)` and `.refine((v) => !isNaN(Date.parse(v)))` to purchase_date in transaction-schema.ts.
- **Decision**: FIXED

### F4 — Currency type duplicated between transaction.ts and schema

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/types/transaction.ts:1
- **Detail**: Currency was a manually maintained union in transaction.ts mirroring CURRENCIES in transaction-schema.ts. Adding a currency required updating both files.
- **Fix Applied**: Replaced the manual union with `export type Currency = (typeof CURRENCIES)[number]` importing CURRENCIES from transaction-schema.ts.
- **Decision**: FIXED

### F5 — fetch() in AddTransactionForm lacks try/catch for network errors

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/transactions/AddTransactionForm.tsx:35
- **Detail**: fetch() throws on network failure. No try/catch wrapped the call, leaving isSubmitting=true permanently and showing no error to the user on network failure.
- **Fix Applied**: Wrapped the fetch call in try/catch; catch block calls setError("root", { message: "Network error. Please check your connection and try again." }).
- **Decision**: FIXED

### F6 — "Add transaction" button placed below table, not in toolbar

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/transactions/DashboardView.tsx:73
- **Detail**: Plan specified the button in the toolbar alongside the Portfolio heading. Implemented below the table/empty-state block. Functionally correct; purely a layout divergence.
- **Decision**: SKIPPED — current layout accepted as-is
