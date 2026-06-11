# Remove Landing Page Implementation Plan

## Overview

Delete the boilerplate starter landing page (`/`) and wire the root route to
redirect auth-aware: authenticated users go to `/dashboard`, unauthenticated users
go to `/auth/signin`. The sign-in page already carries a "Sign up" link, so
removing the public landing page leaves no dead ends.

## Current State Analysis

The root `/` is served by `src/pages/index.astro`, which renders `src/components/Welcome.astro`.
Welcome imports `src/components/Topbar.astro`. All three files are boilerplate from the
10x Astro Starter — none contain Pholio branding or app functionality.

The middleware (`src/middleware.ts`) guards `/dashboard` and auth pages but has no rule for `/`.
After deletion, visiting `/` without a middleware rule would yield a 404.

The only runtime reference to `"/"` in the codebase is `src/pages/api/auth/signout.ts:9`,
which redirects there after sign-out.

## Desired End State

- Visiting `/` redirects to `/dashboard` (authenticated) or `/auth/signin` (unauthenticated) — no 404, no landing page.
- Sign-out sends the user directly to `/auth/signin`.
- `index.astro`, `Welcome.astro`, and `Topbar.astro` are deleted; no orphaned components remain.
- The sign-in page already has a "Sign up" link; no further UI change is needed.

### Key Discoveries

- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]`; add `"/"` handling here.
- `src/pages/api/auth/signout.ts:9` — `context.redirect("/")` is the only root reference.
- `src/components/Topbar.astro` — imported only by `Welcome.astro`; safe to delete.
- `src/pages/auth/signin.astro:17–19` — Sign Up link already present; nothing to add.

## What We're NOT Doing

- Adding any new landing or marketing page.
- Modifying the sign-in or sign-up page UI (Sign Up link already exists).
- Touching auth logic, sessions, or Supabase configuration.
- Changing the 404 page.

## Implementation Approach

Two phases with a manual smoke-test gate between them so the file deletions can
be verified as clean before the routing changes go in.

---

## Phase 1: Delete Orphaned Landing Files

### Overview

Remove the three files that make up the boilerplate landing page. After this phase
`/` has no Astro page — a 404 is expected until Phase 2 wires the middleware redirect.

### Changes Required

#### 1. Delete `src/pages/index.astro`

**File**: `src/pages/index.astro`

**Intent**: This is the only Astro page serving `/`. Deleting it removes the route entirely.

**Contract**: File deleted. No replacement page is created — the middleware redirect in Phase 2 takes over.

---

#### 2. Delete `src/components/Welcome.astro`

**File**: `src/components/Welcome.astro`

**Intent**: Only consumer is `index.astro` (confirmed by grep). Deleting avoids an orphaned component.

**Contract**: File deleted.

---

#### 3. Delete `src/components/Topbar.astro`

**File**: `src/components/Topbar.astro`

**Intent**: Only consumer is `Welcome.astro` (confirmed by grep). Deleting keeps the component tree clean.

**Contract**: File deleted.

---

### Success Criteria

#### Automated Verification

- TypeScript type-check passes with no missing-import errors: `npm run typecheck`
- Lint passes: `npm run lint`
- Build succeeds (no broken imports from the deletions): `npm run build`

#### Manual Verification

- Visiting `/` in the dev server (`npm run dev`) returns a 404 — expected at this phase; confirms the page is gone.
- No console errors about missing `Welcome` or `Topbar` imports.

**Implementation Note**: Confirm the 404 at `/` before moving to Phase 2. The 404 is intentional and temporary.

---

## Phase 2: Wire Root Redirect and Fix Sign-Out Target

### Overview

Add an auth-aware `"/"` redirect to middleware and update `signout.ts` to point
directly to `/auth/signin`, removing any reliance on the now-deleted landing page.

### Changes Required

#### 1. Update `src/middleware.ts` — add auth-aware root redirect

**File**: `src/middleware.ts`

**Intent**: Make `"/"` redirect to `/dashboard` for authenticated users and `/auth/signin` for unauthenticated users, eliminating the 404 that Phase 1 introduced.

**Contract**: Add a guard block after the `AUTH_PAGES` guard (before `return next()`). When `context.url.pathname === "/"`: return `context.redirect("/dashboard")` if `context.locals.user` is set, otherwise return `context.redirect("/auth/signin")`.

---

#### 2. Update `src/pages/api/auth/signout.ts` — change redirect target

**File**: `src/pages/api/auth/signout.ts`

**Intent**: After sign-out the user is unauthenticated; sending them to `/auth/signin` is explicit and avoids a ghost redirect hop through `"/"`.

**Contract**: Change `context.redirect("/")` on line 9 to `context.redirect("/auth/signin")`.

---

### Success Criteria

#### Automated Verification

- TypeScript type-check passes: `npm run typecheck`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Unauthenticated visit to `/` redirects to `/auth/signin`.
- Authenticated visit to `/` redirects to `/dashboard`.
- Signing out lands on `/auth/signin` (not a 404).
- Visiting `/auth/signin` while logged in still redirects to `/dashboard` (middleware guard unchanged).
- No regressions on `/dashboard`, `/auth/signup`, `/auth/confirm-email`.

---

## Testing Strategy

### Manual Testing Steps

1. Open an incognito window; navigate to `/` — should land on `/auth/signin`.
2. Sign in; navigate to `/` — should land on `/dashboard`.
3. Click Sign Out — should land on `/auth/signin`.
4. From the sign-in page, click "Sign up" — should reach `/auth/signup`.
5. While logged in, navigate to `/auth/signin` directly — should redirect to `/dashboard`.

## References

- Middleware: `src/middleware.ts`
- Signout endpoint: `src/pages/api/auth/signout.ts`
- Sign-in page (Sign Up link already present): `src/pages/auth/signin.astro:17–19`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Delete Orphaned Landing Files

#### Automated

- [x] 1.1 TypeScript type-check passes with no missing-import errors
- [x] 1.2 Lint passes
- [x] 1.3 Build succeeds

#### Manual

- [x] 1.4 Visiting `/` returns a 404 in dev server (page is gone)

### Phase 2: Wire Root Redirect and Fix Sign-Out Target

#### Automated

- [ ] 2.1 TypeScript type-check passes
- [ ] 2.2 Lint passes
- [ ] 2.3 Build succeeds

#### Manual

- [ ] 2.4 Unauthenticated visit to `/` redirects to `/auth/signin`
- [ ] 2.5 Authenticated visit to `/` redirects to `/dashboard`
- [ ] 2.6 Sign-out lands on `/auth/signin`
- [ ] 2.7 No regressions on other auth flows
