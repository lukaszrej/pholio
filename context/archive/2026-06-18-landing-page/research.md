---
date: 2026-06-18T00:00:00+00:00
researcher: Claude Sonnet 4.6
git_commit: 5d937873785eccae3083c3d6c5d8b8edbcdd672a
branch: main
repository: pholio
topic: "How to implement Pholio Landing Page from Claude Design project"
tags: [research, landing-page, marketing, astro, design-system]
status: complete
last_updated: 2026-06-18
last_updated_by: Claude Sonnet 4.6
---

# Research: Pholio Landing Page Implementation

**Date**: 2026-06-18  
**Git Commit**: 5d937873785eccae3083c3d6c5d8b8edbcdd672a  
**Branch**: main  
**Repository**: pholio

## Research Question

How to implement the marketing landing page from the Claude Design project (`Pholio Landing Page.html`) into the Astro codebase properly — including all design tokens, components, and middleware routing.

## Summary

The landing page is a static marketing page that already has a pixel-complete HTML reference in the Claude Design project. Implementation requires **two targeted changes**: a one-line middleware patch and a new `src/pages/index.astro`. All design tokens, fonts, and the ticker animation are already present in `src/styles/global.css` — only the CSS variable names need to be translated. No new dependencies are required.

---

## Detailed Findings

### 1. Blocking Middleware Issue (Critical)

**File**: [`src/middleware.ts:48–50`](https://github.com/lukaszrej/pholio/blob/5d937873785eccae3083c3d6c5d8b8edbcdd672a/src/middleware.ts#L48-L50)

```ts
if (context.url.pathname === "/") {
  return context.locals.user ? context.redirect("/dashboard") : context.redirect("/auth/signin");
}
```

The root path currently **never renders a page** — unauthenticated visitors are always redirected to `/auth/signin`. This must be changed to:

```ts
if (context.url.pathname === "/") {
  if (context.locals.user) return context.redirect("/dashboard");
}
// then falls through to next() → renders index.astro
```

This preserves the logged-in redirect while allowing the landing page to render for visitors.

### 2. Design Source — Claude Design Project

- **Project**: `Pholio Design System` (ID: `98daafa8-2c42-450f-9672-6cdfcc69156b`)
- **File**: `Pholio Landing Page.html` — complete, self-contained HTML reference
- **Palette**: The landing page uses the **Crimson variant** (`--cy: #c41230`) — not the "Terminal Light" cyan→indigo palette from `tokens/colors.css`. This matches the existing project palette exactly.

### 3. Landing Page Sections (from design HTML)

The page has **5 sections** in order:

| #   | Section           | Description                                                                                               |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | **Nav**           | Sticky bar: wordmark (logo + Playfair "Pholio") + "Sign in" ghost + "Get started" crimson CTA             |
| 2   | **Hero**          | Green pulse badge · Playfair headline · subtext · two CTAs (primary + ghost)                              |
| 3   | **App Preview**   | Animated ticker tape + full dashboard mockup (tabs, summary strip, holdings table) with bottom fade       |
| 4   | **Features grid** | 3-column (→ 1-col mobile): Multiple portfolios / Live market prices / Watchlist                           |
| 5   | **How it works**  | 3-step list with inline UI mockups (Add portfolio dialog, Add transaction form, Summary + watchlist mini) |
| 6   | **Footer**        | CTA block ("Start tracking today") + brand strip with copyright                                           |

### 4. CSS Variable Mapping — Design → Codebase

The design HTML defines its own inline CSS variables. The existing `src/styles/global.css` already defines equivalents under `--tl-*` names:

| Design variable | Codebase variable            | Value                                        |
| --------------- | ---------------------------- | -------------------------------------------- |
| `--bg`          | `--tl-bg`                    | `#f0f3f9`                                    |
| `--panel`       | `--tl-panel`                 | `#f8fafb`                                    |
| `--panel-2`     | `--tl-panel-2`               | `#eff2f8`                                    |
| `--line`        | `--tl-line`                  | `#dde3ee`                                    |
| `--line-soft`   | `--tl-line-soft`             | `#e6ebf5`                                    |
| `--tx`          | `--tl-tx`                    | `#1a1a2e`                                    |
| `--mut`         | `--tl-mut`                   | `#7a6e60`                                    |
| `--dim`         | `--tl-dim`                   | `#a89e90`                                    |
| `--cy`          | `--tl-cy`                    | `#c41230`                                    |
| `--cy-dark`     | `--tl-cy-ink`                | `#9e0e26` (design: `#8b0d21` — close enough) |
| `--gain`        | `--gain`                     | `#0a9d6e`                                    |
| `--gain-soft`   | `--gain-soft`                | `rgba(10,157,110,.12)`                       |
| `--loss-soft`   | `--loss-soft`                | `rgba(196,18,48,.10)`                        |
| `--f-sans`      | `--font-sans` (via Tailwind) | Geist stack                                  |
| `--f-mono`      | `--font-numeric`             | Geist Mono stack                             |
| `--f-serif`     | `--font-serif`               | Playfair Display                             |
| `--grad`        | `--gradient-brand`           | `linear-gradient(135deg, #c41230, #8b0d21)`  |
| `--sh-cta`      | `--shadow-cta`               | `0 8px 20px -8px rgba(196,18,48,.5)`         |

### 5. What Already Exists in `global.css`

- ✅ `@keyframes ticker-slide` — the infinite scrolling ticker animation
- ✅ All three font imports: Geist, Geist Mono, Playfair Display
- ✅ All `--tl-*` color tokens
- ✅ `--gradient-brand`, `--gradient-wordmark`, `--shadow-cta`
- ✅ `--gain`, `--gain-soft`, `--loss`, `--loss-soft`
- ✅ `.wl-*` watchlist CSS classes (used in the app preview section)

### 6. Layout Strategy — Do NOT use `Layout.astro`

[`src/layouts/Layout.astro:23–38`](https://github.com/lukaszrej/pholio/blob/5d937873785eccae3083c3d6c5d8b8edbcdd672a/src/layouts/Layout.astro#L23-L38) renders `getMissingConfigs()` banners at the top of every page. These are developer-facing error notices — inappropriate on a public marketing page. The landing page should:

- **Import `global.css` directly** (gets fonts, tokens, ticker animation)
- **Write its own `<head>`** (landing-page-specific `<title>` and `<meta>`)
- **Not wrap in `Layout.astro`**

### 7. Implementation: Pure Astro, No React

The landing page is entirely static HTML. No interactivity, no client-side state, no hooks. It should be:

- `src/pages/index.astro` — Astro component with frontmatter importing `global.css`, HTML body, and a `<style>` block for page-scoped CSS.
- The CSS in the design HTML uses inline `var(--...)` shorthand variables — translate these to the `--tl-*` equivalents in the `<style>` block.

### 8. The App Preview Component

The preview section embeds a **full dashboard mockup** as static HTML (not connected to real data). Key sub-components:

- **Ticker tape**: `<div>` with duplicated tickers + `animation: ticker-slide 55s linear infinite` — animation already in `global.css`
- **Portfolio tabs**: Static with a red ink-bar underline on "Dashboard" tab
- **Summary strip**: 4-column grid (total invested / market value / P&L / P&L%)
- **Holdings table**: 5 rows (AAPL, MSFT, NVDA, GOOGL, AMZN) with dot colors matching the Design System's `--chart-1` through `--chart-5`
- **Fade overlay**: `position:absolute` gradient on the bottom of the preview frame

### 9. Responsive Breakpoints

- **Features grid**: `repeat(3, 1fr)` → `1fr` at `max-width: 700px`
- **Step rows**: `flex-wrap: wrap` (copy + UI widget side-by-side → stacked)
- **Nav**: No changes needed at mobile (simple flex with justify-content: space-between)
- **No Tailwind breakpoints required** — the design uses raw media queries which can be in the `<style>` block

---

## Code References

- `src/middleware.ts:48–50` — the redirect block to modify
- `src/styles/global.css:1` — font import (Geist, Geist Mono, Playfair Display)
- `src/styles/global.css:128–135` — `@keyframes ticker-slide` definition
- `src/styles/global.css:7–71` — all `--tl-*` CSS custom properties
- `src/layouts/Layout.astro:23–38` — config banner (reason to skip this layout)
- Claude Design: `Pholio Landing Page.html` — authoritative HTML reference

---

## Architecture Insights

**Why the design palette diverges from the Design System tokens**

The `tokens/colors.css` in the Design System uses a cyan→indigo accent (`--accent: #0a86d8`), while the `Pholio Landing Page.html` and the existing `global.css` use the Crimson palette (`#c41230`). This is intentional: the Design System was built with a "Terminal Light" direction (multiple color themes), but the Pholio project shipped the Crimson/Warm Parchment variant. The landing page correctly uses Crimson — no conflict.

**Ticker tape duplication pattern**

The ticker tape HTML duplicates all 10 tickers to enable a seamless infinite loop: the animation translates to `-50%` (the midpoint of the doubled content), then the CSS resets to `0` — making the scroll appear continuous. This pattern is already used in `src/components/portfolio/WatchlistPanel.tsx`.

---

## Open Questions

1. **Logged-in redirect from `/`**: After the middleware change, should logged-in users still be redirected to `/dashboard` immediately, or should they see the landing page with a "Go to dashboard" CTA? The design's nav has "Sign in" and "Get started" only — it does not have a "Dashboard" link for authenticated state. Keeping the authenticated redirect to `/dashboard` is the simpler path and preserves the current UX.

2. **`--cy-dark` exact value**: The design uses `#8b0d21` for the gradient end-stop, while `global.css` has `--tl-cy-ink: #9e0e26`. The gradient is `--gradient-brand: linear-gradient(135deg, #c41230, #8b0d21)` in global.css — the hardcoded value `#8b0d21` in global.css matches the design exactly. No change needed.

3. **SEO**: The design title is `"Pholio — Track every position, in one calm place."` — worth adding a `<meta name="description">` in the landing page head. Not strictly required for MVP.
