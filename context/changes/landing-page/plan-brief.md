# Pholio Landing Page — Plan Brief

> Full plan: `context/changes/landing-page/plan.md`
> Research: `context/changes/landing-page/research.md`

## What & Why

Build the public marketing landing page at `/` so unauthenticated visitors see the Pholio product pitch instead of being immediately redirected to `/auth/signin`. The root route is currently a dead pass-through that always redirects; a pixel-complete design (`Pholio Landing Page.html`) exists and needs to be implemented.

## Starting Point

`src/middleware.ts:47–50` unconditionally redirects `/` (to `/dashboard` if logged in, `/auth/signin` otherwise) — `/` never renders. `src/pages/index.astro` doesn't exist (it was deleted in the archived `remove-landing-page` change). All design tokens, fonts, and the `ticker-slide` animation already live in `src/styles/global.css`.

## Desired End State

Unauthenticated visitors at `/` see the full 6-section Crimson-palette landing page with an animated ticker; authenticated visitors still redirect to `/dashboard`; signing out lands the user on `/` (the marketing page). No dev config banners, proper SEO/OG tags.

## Key Decisions Made

| Decision         | Choice                                     | Why (1 sentence)                                                        | Source   |
| ---------------- | ------------------------------------------ | ----------------------------------------------------------------------- | -------- |
| Code structure   | Single `index.astro` with scoped `<style>` | Matches the static, no-React reality; closest 1:1 port; nothing to wire | Plan     |
| Layout           | Own `<head>`, skip `Layout.astro`          | `Layout.astro` injects dev config banners onto every page it wraps      | Research |
| Logged-in at `/` | Keep redirect to `/dashboard`              | Preserves current UX; design nav has no Dashboard link                  | Plan     |
| Sign-out target  | Leave `signout.ts` → `/`                   | Zero change; logout lands on the marketing page as a re-pitch           | Plan     |
| SEO              | Title + meta description + basic OG        | Proper indexing & link previews for a public marketing page             | Plan     |
| Palette          | Crimson `--tl-*` from `global.css`         | Project shipped Crimson; Design System cyan tokens are not used         | Research |

## Scope

**In scope:** middleware one-line patch; new `src/pages/index.astro` (6 sections, scoped CSS mapping design vars → `--tl-*`); SEO/OG head.

**Out of scope:** new dependencies, React/island, per-section components, real data in the App Preview mockup, `og:image`, `signout.ts` change, Design System token changes.

## Architecture / Approach

Two files. (1) Middleware: remove only the unauthenticated branch of the `/` redirect so it falls through to `next()`. (2) `index.astro`: import `global.css`, write own `<head>`, port the design HTML body into a single file with a page-scoped `<style>` block; translate the design's inline CSS variables to the existing `--tl-*`/brand tokens; reuse `@keyframes ticker-slide` (duplicated ticker list for seamless loop). Static, no JS.

## Phases at a Glance

| Phase                 | What it delivers                                         | Key risk                                               |
| --------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| 1. Middleware unblock | `/` renders for visitors; logged-in still → `/dashboard` | After this, `/` 404s until Phase 2 (expected gate)     |
| 2. Landing page       | Full static `index.astro`, 6 sections                    | Visual parity with design HTML; ticker loop continuity |

**Prerequisites:** access to `Pholio Landing Page.html` in the Claude Design project for the exact markup/styles.
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- Auth link targets (`/auth/signin`, `/auth/signup`) assumed correct — confirm against `src/pages/auth/` during implementation.
- Visual parity depends on faithfully porting the design HTML; token mapping (not redefinition) is the main correctness lever.
- No `og:image` asset exists yet; OG tags are text-only.

## Success Criteria (Summary)

- Logged-out `/` shows the full landing page with correct palette/fonts and a seamless ticker; CTAs reach sign-in/sign-up.
- Logged-in `/` still redirects to `/dashboard`; sign-out lands on the landing page.
- Build, lint, and typecheck pass; no dev banners on the page.
