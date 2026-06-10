---
change_id: portfolio-roi-view
title: Portfolio ROI view
status: archived
created: 2026-06-09
updated: 2026-06-10
impl_review: context/changes/portfolio-roi-view/reviews/impl-review.md
archived_at: 2026-06-10T18:29:08Z
---

## Notes

### Middleware auth route exemption (Phase 3, 6226c0c)

`src/middleware.ts` was modified outside the Phase 3 plan scope.

**What changed**: Added `PUBLIC_API_ROUTES = ["/api/auth/"]` and a `isPublicApi` guard so the API auth check skips routes starting with `/api/auth/`. All four routes under that prefix (`/api/auth/signin`, `/api/auth/signup`, `/api/auth/signout`, `/api/auth/callback`) are now reachable by unauthenticated users.

**Why**: Latent bug — the `PROTECTED_API_ROUTES` catch-all (`/api/`) was returning 401 to unauthenticated users hitting auth endpoints, which would break the sign-in/sign-up flow for fresh sessions.

**Design note**: The `startsWith("/api/auth/")` match means any future route under `/api/auth/` is automatically public. Route handlers under this prefix must enforce their own auth if they need it.

### Transaction schema refactor (Phase 3, 6226c0c)

`src/lib/transaction-schema.ts`, `src/types/transaction.ts`, `src/components/transactions/AddTransactionForm.tsx`, and `src/pages/api/transactions/index.ts` were modified outside the plan scope.

**What changed**: `CURRENCIES` constant moved from inline in `transaction.ts` to its own export in `transaction-schema.ts`. `Currency` type is now derived from `CURRENCIES` via `(typeof CURRENCIES)[number]` rather than being a standalone union. `NewTransaction` and `UpdateTransaction` utility types were added to `transaction.ts`. All call sites updated to import from the new location.

**Why**: Schema-first consolidation — the Zod schema and the `CURRENCIES` array were the same source of truth for valid currencies; keeping them co-located eliminates the risk of them diverging. A latent inconsistency fix, done alongside Phase 3 as the files were already open.

**Design note**: `transaction-schema.ts` is now the single source of truth for currency values. Any new currency must be added there; `Currency` type updates automatically.
