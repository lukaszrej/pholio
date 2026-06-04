# Auth Flow Complete — Plan Brief

> Full plan: `context/changes/auth-flow-complete/plan.md`

## What & Why

S-01 of the Pholio roadmap requires a user to register, sign in, see an empty dashboard, and sign out. The auth scaffold is ~90% complete — pages, forms, API routes, and middleware all exist — but three targeted gaps prevent the full flow from working: the post-signin redirect goes to `/` instead of `/dashboard`, there is no email confirmation callback route (so production sign-ups can never activate their accounts), and authenticated users can visit the auth forms freely.

## Starting Point

Supabase SSR client, three API routes (signin/signup/signout), three auth pages, a dashboard page, reusable form components, and an auth-aware Topbar are all in place. The middleware already resolves the user and protects `/dashboard` from unauthenticated access.

## Desired End State

Signing in lands on `/dashboard`. New production users who click their confirmation email get a session and land on `/dashboard`. Authenticated users who visit `/auth/signin` or `/auth/signup` are redirected to `/dashboard`. All four S-01 flows work end-to-end in both dev (autoconfirm) and production (email confirm).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Post-signin redirect | `/dashboard` | Matches roadmap S-01 outcome: user sees the dashboard immediately after signing in | Plan |
| Email callback route | Add `/api/auth/callback` | Without it, production email confirmation silently fails — users can never activate their accounts | Plan |
| Already-authenticated on auth pages | Redirect to `/dashboard` | Showing the sign-in form to a signed-in user is confusing UX with no benefit | Plan |
| Sign-out redirect | Keep `/` (landing) | Landing page is designed for unauthenticated visitors; no change needed | Plan |
| Landing page branding | Out of scope | S-01 is about auth mechanics, not content — separate change | Plan |
| Dashboard "empty" state | Current content sufficient | Email + sign-out confirms auth works; empty-state copy belongs in S-02 | Plan |

## Scope

**In scope:**
- Fix post-signin redirect in `src/pages/api/auth/signin.ts`
- Add `emailRedirectTo` to signup call in `src/pages/api/auth/signup.ts`
- Create `src/pages/api/auth/callback.ts` (GET handler, PKCE code exchange)
- Extend `src/middleware.ts` to redirect authenticated users off auth pages
- Add callback URL to Supabase Allowed Redirect URLs (manual dashboard step)

**Out of scope:**
- Landing page content / Pholio branding
- Dashboard empty-state with transaction prompt
- Password reset / forgot-password flow
- Sign-out redirect change

## Architecture / Approach

Four file-level changes to the existing API/middleware layer, plus one Supabase dashboard configuration step. No new UI, no schema changes. The callback route follows the same pattern as existing auth routes in `src/pages/api/auth/` — a single exported handler, using the shared `createClient` from `src/lib/supabase.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Code changes | All four targeted code gaps fixed | Double-quotes rule (lessons.md) — single quotes in new `.ts` files fail lint |
| 2. Config + verify | Supabase callback URL configured; all 4 S-01 flows verified end-to-end | Production email test requires a real Supabase project with email confirmation enabled |

**Prerequisites:** Supabase project connected and env vars set (`SUPABASE_URL`, `SUPABASE_KEY` as text vars in Cloudflare dashboard — not wrangler secrets, per L1 in lessons.md)
**Estimated effort:** ~1 session; Phase 1 is 4 small targeted edits, Phase 2 is configuration + manual testing

## Open Risks & Assumptions

- Assumes Supabase project has "Confirm email" toggled correctly for each environment (autoconfirm ON in dev, OFF in prod for the email-confirmation test)
- Production email confirmation test requires access to the registered email inbox

## Success Criteria (Summary)

- Signing in with valid credentials redirects to `/dashboard` (not `/`)
- In production, clicking the Supabase confirmation email creates a session and redirects to `/dashboard`
- All four S-01 user flows (register, sign in, see dashboard, sign out) complete without error
