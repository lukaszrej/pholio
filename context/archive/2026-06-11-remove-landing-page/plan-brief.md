# Remove Landing Page — Plan Brief

> Full plan: `context/changes/remove-landing-page/plan.md`

## What & Why

Delete the boilerplate "10x Astro Starter" landing page that serves `/` and replace it
with an auth-aware middleware redirect. The landing page was never Pholio content — it's
starter template scaffolding with no place in a personal portfolio tracker where every
meaningful screen is behind auth.

## Starting Point

`src/pages/index.astro` renders `Welcome.astro` (which imports `Topbar.astro`). All three
are starter boilerplate. The only runtime link to `"/"` in the codebase is `signout.ts:9`.
Middleware already guards `/dashboard` and auth pages but has no rule for `"/"`.

## Desired End State

Visiting `/` redirects to `/dashboard` (authenticated) or `/auth/signin` (unauthenticated).
Sign-out goes directly to `/auth/signin`. No orphaned components remain. The sign-in page
already has a "Sign up" link, so no public entry point is lost.

## Key Decisions Made

| Decision            | Choice                 | Why (1 sentence)                                                 | Source   |
| ------------------- | ---------------------- | ---------------------------------------------------------------- | -------- |
| Root redirect logic | Auth-aware (1 hop)     | Avoids the double-hop of always sending to /auth/signin          | Plan     |
| Sign-out target     | /auth/signin directly  | Explicit intent; no ghost redirect through deleted page          | Plan     |
| Dead code scope     | Delete all three files | index.astro, Welcome.astro, Topbar.astro have no other consumers | Plan     |
| Sign-up link        | Already present        | signin.astro:17–19 already has "Don't have an account? Sign up"  | Research |

## Scope

**In scope:** Delete index.astro, Welcome.astro, Topbar.astro; add "/" guard to middleware; update signout.ts redirect.

**Out of scope:** Marketing/landing page design, auth logic changes, sign-in/sign-up UI (Sign Up link already exists).

## Architecture / Approach

All routing logic lives in `src/middleware.ts`. A new guard block added before `return next()` handles
`pathname === "/"`: authenticated users get `/dashboard`, unauthenticated users get `/auth/signin`.
The existing auth-page guard (`/auth/signin` + `/auth/signup`) already redirects logged-in users to
`/dashboard`, so the chain is consistent. `signout.ts` is updated to skip the `"/"` hop entirely.

## Phases at a Glance

| Phase                               | What it delivers                                               | Key risk                                                   |
| ----------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| 1. Delete orphaned landing files    | index.astro, Welcome.astro, Topbar.astro gone; `/` returns 404 | None — grep confirmed no other consumers                   |
| 2. Wire root redirect + fix signout | `/` never 404s; sign-out lands on /auth/signin                 | Middleware block must be placed after auth-user resolution |

**Prerequisites:** None — standalone change, no migrations or dependencies.  
**Estimated effort:** ~1 session, both phases in one sitting.

## Open Risks & Assumptions

- If any other file imports `Topbar.astro` or `Welcome.astro` that grep missed, the build in Phase 1 will catch it.
- The middleware auth-aware block must execute after `context.locals.user` is set (it does — the user resolution is at the top of the middleware function).

## Success Criteria (Summary)

- Visiting `/` in a browser always redirects — never 404s — in both authenticated and unauthenticated states.
- Sign-out lands the user on `/auth/signin`.
- All other auth flows are unaffected.
