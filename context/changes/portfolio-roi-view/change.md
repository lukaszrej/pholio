---
change_id: portfolio-roi-view
title: Portfolio ROI view
status: implemented
created: 2026-06-09
updated: 2026-06-10
archived_at: null
---

## Notes

### Middleware auth route exemption (Phase 3, 6226c0c)

`src/middleware.ts` was modified outside the Phase 3 plan scope.

**What changed**: Added `PUBLIC_API_ROUTES = ["/api/auth/"]` and a `isPublicApi` guard so the API auth check skips routes starting with `/api/auth/`. All four routes under that prefix (`/api/auth/signin`, `/api/auth/signup`, `/api/auth/signout`, `/api/auth/callback`) are now reachable by unauthenticated users.

**Why**: Latent bug — the `PROTECTED_API_ROUTES` catch-all (`/api/`) was returning 401 to unauthenticated users hitting auth endpoints, which would break the sign-in/sign-up flow for fresh sessions.

**Design note**: The `startsWith("/api/auth/")` match means any future route under `/api/auth/` is automatically public. Route handlers under this prefix must enforce their own auth if they need it.
