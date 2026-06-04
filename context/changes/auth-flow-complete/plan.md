# Auth Flow Complete — Implementation Plan

## Overview

Fill three targeted gaps in the existing auth scaffold so the S-01 outcome is delivered end-to-end: fix the post-signin redirect, add a Supabase PKCE callback route for email confirmation, and protect auth pages from already-authenticated users. All UI pages, forms, and components already exist and are correct.

## Current State Analysis

The auth scaffold is ~90% complete. Three gaps prevent the S-01 outcome ("register, sign in, see dashboard, sign out") from being fully delivered:

1. **Signin redirect**: `src/pages/api/auth/signin.ts:19` redirects to `/` instead of `/dashboard`
2. **No email confirmation callback**: `src/pages/api/auth/callback.ts` does not exist; in production Supabase email confirmation links carry a PKCE code that must be exchanged for a session server-side — without the route, confirmed users silently never get a session
3. **No auth-page protection**: authenticated users can visit `/auth/signin` and `/auth/signup` and see the forms

**Existing assets (no changes needed):**
- `src/middleware.ts:4-25` — protects `/dashboard`, sets `context.locals.user`
- `src/lib/supabase.ts` — SSR client, returns `null` if env vars are missing
- All pages: `src/pages/auth/signin.astro`, `signup.astro`, `confirm-email.astro`, `dashboard.astro`
- All form components: `src/components/auth/`
- Auth-aware Topbar: `src/components/Topbar.astro` — already shows correct nav for authenticated vs unauthenticated state

## Desired End State

- Signing in lands the user on `/dashboard` (not `/`)
- New production users who click their confirmation email get a session and land on `/dashboard`
- Authenticated users trying to visit `/auth/signin` or `/auth/signup` are redirected to `/dashboard`
- Sign-out redirects to `/` (unchanged, intentional)
- All 4 flows (register, sign in, see dashboard, sign out) work end-to-end in both dev (autoconfirm) and production (email confirm)

### Key Discoveries:

- `src/pages/api/auth/signin.ts:19` — `context.redirect("/")` is the current broken redirect target
- `src/pages/api/auth/signup.ts:14` — `supabase.auth.signUp` called without `emailRedirectTo`; without it Supabase uses only the Site URL from its dashboard, making the callback URL non-derivable at runtime
- `src/middleware.ts:14-20` — user identity is already resolved before route checks; auth-page protection can be appended cleanly after the existing `PROTECTED_ROUTES` block
- lessons.md: double-quotes rule applies to all new TypeScript files; single quotes fail the Prettier lint check

## What We're NOT Doing

- Landing page rebranding (`Welcome.astro` still shows "10x Astro Starter") — out of S-01 scope
- Dashboard empty-state with transaction prompt — belongs in S-02 (add-transaction)
- Password reset / forgot-password flow — not in S-01 scope
- Sign-out redirect change — `/` (landing) is the correct destination

## Implementation Approach

Three existing files get targeted edits; one new file is created. Then one Supabase dashboard configuration step. Changes are independent and can be reviewed together.

## Critical Implementation Details

**Middleware ordering**: The existing middleware resolves the user first, then checks `PROTECTED_ROUTES`. The new auth-page redirect block must come after the `PROTECTED_ROUTES` block — not before it — so both checks use the already-resolved `context.locals.user`.

**emailRedirectTo origin**: Derive the origin dynamically from the incoming request so that the same code works for localhost and production without any env-var changes: `const origin = new URL(context.request.url).origin`.

---

## Phase 1: Code changes — fix redirect, add callback route, protect auth pages

### Overview

Four targeted changes: fix the signin redirect; add `emailRedirectTo` to signup so Supabase knows where to send confirmation links; create the GET callback handler for PKCE code exchange; extend middleware to redirect authenticated users away from auth pages.

### Changes Required:

#### 1. Fix post-signin redirect

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Change the success redirect from `/` to `/dashboard` so users land on the dashboard immediately after signing in, matching the S-01 outcome.

**Contract**: Line 19 — change `context.redirect("/")` to `context.redirect("/dashboard")`.

---

#### 2. Add emailRedirectTo to signup

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Pass the callback URL to Supabase's `signUp` call so confirmation emails link back to `/api/auth/callback` on the correct origin.

**Contract**: Derive `origin` from the request URL and pass `options.emailRedirectTo`. This is not derivable from the surrounding pattern — the option is nested and the origin must come from the request, not from env vars:

```typescript
const origin = new URL(context.request.url).origin;
const { error } = await supabase.auth.signUp({
  email,
  password,
  options: { emailRedirectTo: `${origin}/api/auth/callback` },
});
```

---

#### 3. Create email confirmation callback route

**File**: `src/pages/api/auth/callback.ts` *(new file)*

**Intent**: Handle the Supabase PKCE email confirmation link. Supabase appends `?code=<PKCE code>` to the redirect URL; this GET handler exchanges the code for a session and sets auth cookies, then redirects to `/dashboard`.

**Contract**: GET route. Extract `code` from search params, call `exchangeCodeForSession`, redirect to `/dashboard`. If no code or supabase client is unavailable, redirect to `/dashboard` anyway — the middleware will then send the unauthenticated user to `/auth/signin`.

```typescript
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get("code");
  if (code) {
    const supabase = createClient(context.request.headers, context.cookies);
    if (supabase) {
      await supabase.auth.exchangeCodeForSession(code);
    }
  }
  return context.redirect("/dashboard");
};
```

---

#### 4. Protect auth pages from authenticated users

**File**: `src/middleware.ts`

**Intent**: Redirect authenticated users who navigate to `/auth/signin` or `/auth/signup` to `/dashboard` instead of showing them the forms.

**Contract**: Add a constant `AUTH_PAGES` and append a redirect block after the existing `PROTECTED_ROUTES` block. The block must come after (not before) the protected-routes check so the ordering is: resolve user → protect dashboard for guests → protect auth pages for authenticated users.

```typescript
const AUTH_PAGES = ["/auth/signin", "/auth/signup"];

// append after the PROTECTED_ROUTES block:
if (AUTH_PAGES.some((route) => context.url.pathname.startsWith(route))) {
  if (context.locals.user) {
    return context.redirect("/dashboard");
  }
}
```

---

### Success Criteria:

#### Automated Verification:

- TypeScript check passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Signing in with valid credentials redirects to `/dashboard`, not `/`
- Visiting `/auth/signin` while authenticated redirects to `/dashboard`
- Visiting `/auth/signup` while authenticated redirects to `/dashboard`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Supabase configuration + end-to-end verification

### Overview

Add the callback URL to Supabase's Allowed Redirect URLs (required for email confirmation links to be accepted by Supabase's security checks). Then verify all four S-01 flows end-to-end.

### Changes Required:

#### 1. Configure callback URL in Supabase dashboard

**File**: Supabase Dashboard → Authentication → URL Configuration *(manual configuration step)*

**Intent**: Supabase rejects confirmation link redirects to URLs not on the allowlist. Adding both local dev and production callback URLs makes the full flow work across environments.

**Contract**: Add to Allowed Redirect URLs:
- `http://localhost:4321/api/auth/callback`
- `https://<production-domain>/api/auth/callback`

---

### Success Criteria:

#### Automated Verification:

*(no automated steps — this phase is configuration and end-to-end manual testing)*

#### Manual Verification:

- **Dev flow (autoconfirm ON)**: Register with a new email → land on `/auth/confirm-email` (shows success) → sign in → land on `/dashboard` with user email visible → sign out → land on `/` with Topbar showing "Sign in" / "Sign up"
- **Production flow (email confirm ON)**: Register → receive confirmation email → click link → land on `/dashboard` with active session; Topbar shows user email and "Sign out"
- **Auth-page guard**: Authenticated user navigating to `/auth/signin` or `/auth/signup` is immediately redirected to `/dashboard`
- **Signout**: Signing out from the dashboard lands on `/`; Topbar shows "Not signed in" with Sign in / Sign up links

**Implementation Note**: The production email confirmation test requires a Supabase project with email confirmation enabled and access to the registered email inbox. If testing locally only, smoke-test the callback route by visiting `/api/auth/callback` manually with a dummy `?code=` — it should redirect to `/dashboard`, and the middleware will redirect to `/auth/signin` (no active session).

---

## Testing Strategy

### Manual Testing Steps:

1. Run `npm run dev`, open `http://localhost:4321`
2. Register a new account → verify redirect to `/auth/confirm-email`
3. Sign in with existing credentials → verify redirect to `/dashboard`, user email visible in page and Topbar
4. While signed in, navigate to `http://localhost:4321/auth/signin` → verify redirect to `/dashboard`
5. While signed in, navigate to `http://localhost:4321/auth/signup` → verify redirect to `/dashboard`
6. Click Sign out → verify redirect to `/`, Topbar shows "Not signed in" with Sign in / Sign up links
7. In production: register, check email, click confirmation link → verify `/dashboard` with active session

## Performance Considerations

None — changes are pure redirect logic and a single async Supabase call per request, consistent with the existing middleware pattern.

## Migration Notes

None — no schema changes, no data migration.

## References

- Roadmap S-01: `context/foundation/roadmap.md`
- Change: `context/changes/auth-flow-complete/change.md`
- Supabase SSR PKCE exchange: `src/lib/supabase.ts` (existing pattern for `createServerClient`)
- Lessons: `context/foundation/lessons.md` (double-quotes rule applies to all new `.ts` files)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Code changes

#### Automated

- [x] 1.1 TypeScript check passes: `npx astro check`
- [x] 1.2 Linting passes: `npm run lint`

#### Manual

- [x] 1.3 Signing in with valid credentials redirects to `/dashboard`, not `/`
- [x] 1.4 Visiting `/auth/signin` while authenticated redirects to `/dashboard`
- [x] 1.5 Visiting `/auth/signup` while authenticated redirects to `/dashboard`

### Phase 2: Supabase configuration + end-to-end verification

#### Manual

- [ ] 2.1 Dev flow: register → `/auth/confirm-email` → sign in → `/dashboard` → sign out → `/`
- [ ] 2.2 Production flow: register → email arrives → click link → `/dashboard` with active session
- [ ] 2.3 Auth-page guard: authenticated user redirected away from `/auth/signin` and `/auth/signup`
- [ ] 2.4 Signout: land on `/`, Topbar shows "Not signed in" with Sign in / Sign up links
