# Pholio Landing Page Implementation Plan

## Overview

Build the public marketing landing page at `/` so unauthenticated visitors see the Pholio product pitch instead of being immediately redirected to `/auth/signin`. The change is two targeted edits: a one-line middleware patch that lets `/` fall through to a rendered page for visitors (while keeping the logged-in redirect to `/dashboard`), and a new self-contained static `src/pages/index.astro` that ports the pixel-complete design from the Claude Design project (`Pholio Landing Page.html`). No new dependencies.

## Current State Analysis

- **`src/middleware.ts:47–50`** — the root path is a dead pass-through: `if (context.url.pathname === "/")` unconditionally redirects — `/dashboard` when authenticated, `/auth/signin` otherwise. `/` never renders a page today.
- **`src/pages/index.astro` does not exist** — it (and `Welcome.astro` / `Topbar.astro`) were deleted in the archived `remove-landing-page` change (`context/archive/2026-06-11-remove-landing-page/`). That change removed boilerplate; this change adds a real marketing page back.
- **`src/styles/global.css`** already contains everything the design needs (verified line-by-line):
  - Font import (Geist, Geist Mono, Playfair Display) at `:1`.
  - All `--tl-*` Crimson tokens at `:55–71` (`--tl-bg`, `--tl-panel`, `--tl-panel-2`, `--tl-line`, `--tl-line-soft`, `--tl-tx`, `--tl-mut`, `--tl-dim`, `--tl-cy`, `--tl-cy-ink`).
  - `--gradient-brand` (`linear-gradient(135deg, #c41230, #8b0d21)`), `--gradient-wordmark`, `--shadow-cta`, `--gain`, `--gain-soft`, `--loss`, `--loss-soft`.
  - `@keyframes ticker-slide` (`from translateX(0)` → `to translateX(-50%)`) and `.summary-grid` (2-col mobile → expandable).
- **`src/layouts/Layout.astro:23–38`** renders `getMissingConfigs()` dev banners at the top of every page it wraps — inappropriate on a public marketing page. The landing page must NOT use this layout.
- **`src/pages/api/auth/signout.ts`** redirects to `/` after sign-out. After this change, a signed-out (now unauthenticated) user lands on the marketing page. This is the desired behavior — no change to signout.ts.
- **`src/pages/dashboard.astro`** is the only existing `.astro` page and uses `Layout.astro` + a React island. The landing page deliberately diverges: pure Astro, own `<head>`, no island.

## Desired End State

- An unauthenticated visitor to `/` sees the full Pholio marketing landing page (6 sections, Crimson palette, animated ticker).
- An authenticated visitor to `/` is still redirected to `/dashboard` (unchanged UX).
- A user who signs out is sent to `/` and sees the landing page (re-pitch), with the nav's "Sign in" / "Get started" CTAs available.
- The page renders with the existing fonts, tokens, and ticker animation from `global.css` — no dev config banners.
- `<head>` carries a marketing title, meta description, and basic Open Graph tags for link previews.

**Verification:** `npm run build` succeeds; visiting `/` logged-out renders the landing page; visiting `/` logged-in redirects to `/dashboard`; `npm run lint` and typecheck pass.

### Key Discoveries

- `src/middleware.ts:47–50` — the redirect block to patch; only the unauthenticated branch is removed.
- `src/styles/global.css:1` — font import already present (no per-page font loading needed).
- `src/styles/global.css:55–71` — `--tl-*` tokens; the design HTML's bare `var(--bg)` etc. map to these (see Token Mapping below).
- `src/styles/global.css` `@keyframes ticker-slide` — reuse directly for the App Preview ticker tape.
- `src/layouts/Layout.astro:23–38` — config-banner block; the reason the landing page writes its own `<head>` instead of wrapping in Layout.
- `src/pages/api/auth/signout.ts` — redirects to `/`; intentionally left unchanged so logout lands on the marketing page.

## What We're NOT Doing

- No new dependencies, no React/island, no client-side state — the page is fully static.
- Not using `Layout.astro` (dev banners) — the landing page owns its `<head>` and `<body>`.
- Not changing `signout.ts` — redirect to `/` is the intended post-logout destination.
- Not adding a "Dashboard" nav link or changing the page for logged-in users (they redirect away).
- Not splitting the page into per-section Astro components — single `index.astro` with a scoped `<style>` block.
- Not wiring the App Preview mockup to real data — it is static illustrative HTML.
- Not adding an `og:image` asset (no image exists yet); OG tags are text-only.
- Not touching the Design System tokens (`tokens/colors.css`); the Crimson palette in `global.css` is authoritative.

## Implementation Approach

Two phases with a manual verification gate between them. Phase 1 patches the middleware so `/` can render. After Phase 1 and before Phase 2, `/` returns a 404 for unauthenticated visitors (no page exists yet) — this is expected and is the gate's checkpoint. Phase 2 adds `index.astro`, which fills that route.

The page is a near 1:1 port of `Pholio Landing Page.html` (Claude Design project). The only translation work is renaming the design's inline CSS variables to the `--tl-*` equivalents already defined in `global.css`, so the page inherits the project's exact palette, fonts, and ticker animation.

## Critical Implementation Details

**Token translation (design HTML → codebase).** The design HTML defines its own short-form variables inline; map each to the `--tl-*` / brand token already in `global.css` rather than redefining them in the page's `<style>` block:

| Design var    | Codebase var     |     | Design var               | Codebase var                       |
| ------------- | ---------------- | --- | ------------------------ | ---------------------------------- |
| `--bg`        | `--tl-bg`        |     | `--cy`                   | `--tl-cy`                          |
| `--panel`     | `--tl-panel`     |     | `--cy-dark`              | (gradient uses `--gradient-brand`) |
| `--panel-2`   | `--tl-panel-2`   |     | `--gain` / `--gain-soft` | `--gain` / `--gain-soft`           |
| `--line`      | `--tl-line`      |     | `--loss-soft`            | `--loss-soft`                      |
| `--line-soft` | `--tl-line-soft` |     | `--f-sans`               | `--font-sans`                      |
| `--tx`        | `--tl-tx`        |     | `--f-mono`               | `--font-numeric`                   |
| `--mut`       | `--tl-mut`       |     | `--f-serif`              | `--font-serif`                     |
| `--dim`       | `--tl-dim`       |     | `--grad`                 | `--gradient-brand`                 |
|               |                  |     | `--sh-cta`               | `--shadow-cta`                     |

The gradient end-stop `#8b0d21` is already baked into `--gradient-brand` — do not introduce a separate `--cy-dark`.

**Ticker tape continuity.** The ticker row must duplicate its full ticker list so the `ticker-slide` animation (translateX 0 → -50%) loops seamlessly at the doubled-content midpoint. Same pattern already used in `src/components/portfolio/WatchlistPanel.tsx`.

**Quote style.** Any frontmatter/script in the `.astro` file must use double quotes (Prettier enforces this in CI — see `context/foundation/lessons.md`).

---

## Phase 1: Middleware Unblock

### Overview

Change the `/` rule in `src/middleware.ts` so only authenticated users are redirected to `/dashboard`; unauthenticated requests fall through to `next()` and render the page at `/`. After this phase, `/` returns 404 for visitors until Phase 2 adds the page — expected.

### Changes Required

#### 1. Root-path redirect rule

**File**: `src/middleware.ts`

**Intent**: Stop redirecting unauthenticated visitors away from `/` while preserving the authenticated redirect to `/dashboard`, so the landing page can render for visitors.

**Contract**: Replace the single-return `/` block (currently lines 47–50) so the authenticated branch redirects to `/dashboard` and the unauthenticated branch does nothing (falls through to the existing `return next()`). Update the explanatory comment to reflect that `/` now renders for visitors. No other route rules change.

### Success Criteria

#### Automated Verification

- Build succeeds: `npm run build`
- Linting passes: `npm run lint`
- Type checking passes: `npm run typecheck` (or the project's Astro check script)

#### Manual Verification

- Visiting `/` while logged in still redirects to `/dashboard`.
- Visiting `/` while logged out no longer redirects to `/auth/signin` (it now 404s, since the page does not exist yet — expected pre-Phase 2).
- Protected routes (`/dashboard`, `/api/*`) and auth pages still behave as before.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the routing behaves as described (including the expected 404 at `/`) before proceeding to Phase 2.

---

## Phase 2: Landing Page

### Overview

Create `src/pages/index.astro` — a self-contained static marketing page that ports the 6 sections of the design HTML, imports `global.css`, writes its own `<head>`, and uses a page-scoped `<style>` block referencing the `--tl-*` tokens.

### Changes Required

#### 1. Landing page component

**File**: `src/pages/index.astro` (new)

**Intent**: Render the full Pholio marketing page for unauthenticated visitors, as a faithful port of `Pholio Landing Page.html` using existing tokens, fonts, and the ticker animation.

**Contract**: Astro component with:

- **Frontmatter**: `import "../styles/global.css";` (pulls fonts, `--tl-*` tokens, `ticker-slide`, `.summary-grid`). No Layout import, no React island, no data fetching. Double quotes throughout.
- **`<head>`**: `<meta charset>`, viewport, favicon (`/favicon.png`, matching Layout.astro), `<title>` = `"Pholio — Track every position, in one calm place."`, `<meta name="description">` from the design tagline, and basic Open Graph tags (`og:title`, `og:description`, `og:type=website`). No `og:image`.
- **`<body>`**: the 6 sections in order —
  1. **Nav** — sticky bar: wordmark (logo mark + Playfair "Pholio"), "Sign in" ghost link → `/auth/signin`, "Get started" crimson CTA → `/auth/signup`.
  2. **Hero** — green pulse badge, Playfair headline, subtext, two CTAs (primary → `/auth/signup`, ghost → `#features` or `/auth/signin` per design).
  3. **App Preview** — animated ticker tape (duplicated ticker list + `animation: ticker-slide 55s linear infinite`) + static dashboard mockup (portfolio tabs with red ink-bar, 4-col summary strip, 5-row holdings table with `--chart-1..5` dot colors) + bottom fade overlay.
  4. **Features grid** — 3 columns (Multiple portfolios / Live market prices / Watchlist), collapsing to 1 column at `max-width: 700px`.
  5. **How it works** — 3-step rows with inline UI mockups (Add portfolio dialog, Add transaction form, Summary + watchlist mini); `flex-wrap: wrap` for mobile stacking.
  6. **Footer** — CTA block ("Start tracking today" → `/auth/signup`) + brand strip with copyright.
- **`<style>` block**: page-scoped CSS ported from the design HTML, with design variables rewritten to the `--tl-*` / brand tokens per the Token Mapping table above. Raw media queries (`max-width: 700px` features grid; step-row wrap) live here — no Tailwind breakpoints needed.

Link targets: confirm `/auth/signin` and `/auth/signup` against the existing auth pages before finalizing (`src/pages/auth/`).

### Success Criteria

#### Automated Verification

- Build succeeds: `npm run build`
- Linting passes: `npm run lint`
- Type checking passes: `npm run typecheck`

#### Manual Verification

- Visiting `/` logged out renders the full landing page (all 6 sections) with the Crimson palette and correct fonts.
- The ticker tape scrolls seamlessly (no visible jump at loop boundary).
- "Sign in" → `/auth/signin`, "Get started" / hero CTA / footer CTA → `/auth/signup` all navigate correctly.
- No dev config banners appear on the page.
- Responsive: features grid collapses to 1 column and step rows stack on a narrow viewport (<700px).
- Visiting `/` logged in still redirects to `/dashboard`; signing out lands on `/` and shows the landing page.
- Visual parity with `Pholio Landing Page.html` is acceptable on desktop and mobile.

**Implementation Note**: After automated verification passes, pause for manual confirmation of visual parity and link behavior before considering the change complete.

---

## Testing Strategy

### Manual Testing Steps

1. Logged out, visit `/` → full landing page renders; check all 6 sections present.
2. Watch the ticker tape through at least one full loop → confirm seamless continuity.
3. Click each CTA → verify `/auth/signin` and `/auth/signup` destinations.
4. Resize to <700px → features grid is single-column, step rows stack.
5. Log in, visit `/` → redirected to `/dashboard`.
6. Sign out → land on `/`, landing page renders, "Sign in"/"Get started" available.
7. Confirm no `getMissingConfigs` dev banners appear on `/`.

### Automated

- `npm run build`, `npm run lint`, `npm run typecheck` (or Astro check) all green. There are no unit/integration tests for static marketing markup; coverage here is build + lint + manual visual review (consistent with the project's test-plan negative-space for static pages).

## Performance Considerations

Fully static page; the only animation is the CSS `ticker-slide` transform (GPU-friendly). No JS, no data fetching, no island hydration. Fonts already loaded via the shared `global.css` import.

## Migration Notes

None — additive route. `signout.ts` already targets `/` and now resolves to a real page; no data or schema changes.

## References

- Research: `context/changes/landing-page/research.md`
- Prior (inverse) change: `context/archive/2026-06-11-remove-landing-page/plan.md`
- Design source: `Pholio Landing Page.html` (Claude Design project, ID `98daafa8-2c42-450f-9672-6cdfcc69156b`)
- Tokens & animation: `src/styles/global.css:1`, `:55–71`, `@keyframes ticker-slide`
- Ticker pattern reference: `src/components/portfolio/WatchlistPanel.tsx`
- Lessons: `context/foundation/lessons.md` (double quotes in TS)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Middleware Unblock

#### Automated

- [x] 1.1 Build succeeds: `npm run build` — 2fd0280
- [x] 1.2 Linting passes: `npm run lint` — 2fd0280
- [x] 1.3 Type checking passes: `npm run typecheck` — 2fd0280

#### Manual

- [x] 1.4 `/` logged in still redirects to `/dashboard` — 2fd0280
- [x] 1.5 `/` logged out no longer redirects (404 expected pre-Phase 2) — 2fd0280
- [x] 1.6 Protected/auth routes unchanged — 2fd0280

### Phase 2: Landing Page

#### Automated

- [x] 2.1 Build succeeds: `npm run build`
- [x] 2.2 Linting passes: `npm run lint`
- [x] 2.3 Type checking passes: `npm run typecheck`

#### Manual

- [x] 2.4 `/` logged out renders all 6 sections with correct palette/fonts
- [x] 2.5 Ticker tape loops seamlessly
- [x] 2.6 CTA links navigate to `/auth/signin` and `/auth/signup`
- [x] 2.7 No dev config banners on the page
- [x] 2.8 Responsive collapse works (<700px)
- [x] 2.9 Logged-in redirect + post-signout landing verified
- [x] 2.10 Visual parity with design HTML acceptable (desktop + mobile)
