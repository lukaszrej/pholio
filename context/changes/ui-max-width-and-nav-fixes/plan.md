# UI Max-Width, Portfolio Table Width, and Nav Tab Centering — Implementation Plan

## Overview

Three surgical visual fixes to the Pholio dashboard. All changes are self-contained and land in a single commit: (1) restore the 1024 px max-width constraint on dashboard content with TickerTape as the only full-bleed element, (2) fix the portfolio holdings table so it fills its grid column on wide screens, and (3) center nav tab button content so labels align with the ink underline.

## Current State Analysis

The `mx-auto max-w-6xl` centered wrapper present before the Terminal-Light rewrite (commit `9d49654`) was removed in `f728841`. The holdings table has `display: table` on its wrapper div at `global.css:173`, which shrinks the div to content width rather than letting it fill the `1fr` grid column. The `tabBtnStyle` function is missing `justifyContent: "center"`, so flex content (label + badge) sits left-aligned inside the padding box while the ink bar spans the full button width.

## Desired End State

On screens wider than 1024 px:

- Only TickerTape spans the full viewport width; the rest of the page content is centred at 1024 px with equal gray gutters on both sides.
- On the individual portfolio tab, the holdings table fills the full `1fr` column without unused horizontal space.
- Nav tab labels (with or without the count badge) are visually centred beneath the blue ink underline.

### Key Discoveries

- `src/components/transactions/DashboardView.tsx:412` — root div; TickerTape rendered at :414 before the header
- `src/components/transactions/DashboardView.tsx:82-101` — `tabBtnStyle`, missing `justifyContent`
- `src/styles/global.css:173` — `.holdings-table { display: table; }` inside the `@media (min-width: 768px)` block
- Modal and dialog elements (lines 653+) are React portals that render to `document.body`; their DOM parent doesn't affect layout

## What We're NOT Doing

- Changing any spacing, padding, or colour tokens
- Modifying the TickerTape component itself
- Changing the ink-bar calculation logic (`offsetWidth` / `offsetLeft`) — it is correct once content is centred
- Adding responsive breakpoints for the max-width wrapper (1024 px is fixed as per user decision)
- Any changes to `PortfolioSection.tsx` — the grid and holdings panel wrappers are correct; only the CSS display value is wrong

## Implementation Approach

Three independent one-liner changes across two files. The max-width wrapper in `DashboardView.tsx` wraps the header, nav tabs, main content, and mobile sticky CTA bar — stopping before the portal-rendered modals. The CSS fix and the `justifyContent` addition are each a single property.

---

## Phase 1: Three Surgical UI Fixes

### Overview

Add a 1024 px centred wrapper in `DashboardView.tsx`, fix `.holdings-table` display mode in `global.css`, and add `justifyContent: "center"` to `tabBtnStyle`.

### Changes Required

#### 1. Centred max-width wrapper — `DashboardView.tsx`

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Restore the centred layout by wrapping the header, nav tabs, main content, and mobile CTA in a `maxWidth: 1024` div placed immediately after `<TickerTape />`. Modals and dialogs (lines 653+) stay outside the wrapper because they are portal-rendered.

**Contract**: Insert an opening `<div>` tag after line 414 (`<TickerTape ... />`) and a closing `</div>` before line 653 (`{/* Lots modal */}`). The wrapper style: `{ maxWidth: 1024, margin: "0 auto" }`. No `width` property needed — a block div fills its parent naturally and `maxWidth` caps it.

#### 2. Fix `.holdings-table` display — `global.css`

**File**: `src/styles/global.css`

**Intent**: Change the desktop display value of `.holdings-table` from `table` to `block` so the div fills the `1fr` grid column. The child `<table style={{ width: "100%" }}>` then naturally expands to the full column width.

**Contract**: Line 173: `display: table;` → `display: block;`. The `overflowX: "auto"` inline style on the same element (in `PortfolioSection.tsx`) is unchanged — horizontal scrolling still works when the table content overflows.

#### 3. Centre tab button content — `DashboardView.tsx`

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Add `justifyContent: "center"` to `tabBtnStyle` so the flex row (label text + optional badge) is horizontally centred within the button's padding box, aligning the text/badge centre with the ink bar's centre.

**Contract**: In the `tabBtnStyle` return object (lines 82-101), add `justifyContent: "center" as const` after `alignItems: "center"`.

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Type check passes: `npm run typecheck`

#### Manual Verification

- On a ≥1280 px wide screen: visible gray gutters appear on both sides of the header, nav, and content area; only TickerTape spans edge to edge
- On the individual portfolio tab at ≥768 px: the holdings table fills the full `1fr` column with no wasted white space between the table right edge and the 320 px sidebar
- On any tab with a label, the ink underline is visually centred under the label text; on a tab with a label + count badge, the underline is centred under the label+badge group

---

## Testing Strategy

### Manual Testing Steps

1. Resize the browser to 1440 px wide. Confirm TickerTape is full-bleed; confirm header, nav, and main content are constrained with gray gutters on both sides.
2. Navigate to a portfolio with holdings. Confirm the table stretches to fill the holdings column on desktop (no large gap between table end and sidebar).
3. Click each nav tab. Confirm the blue underline is visually centred under each label (and under label+badge pairs).
4. Resize to 375 px (mobile). Confirm no visual regressions: full-width layout, holdings list view shown, nav tabs scroll correctly.

## References

- Related research: `context/changes/ui-max-width-and-nav-fixes/research.md`
- Archived max-width change: `context/archive/2026-06-13-app-max-width/`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Three Surgical UI Fixes

#### Automated

- [x] 1.1 Lint passes: `npm run lint`
- [x] 1.2 Type check passes: `npm run typecheck`

#### Manual

- [ ] 1.3 Gray gutters visible on wide screen; only TickerTape is full-bleed
- [ ] 1.4 Holdings table fills full column width on individual portfolio tab at ≥768 px
- [ ] 1.5 Ink underline centred under nav tab labels (with and without count badge)
- [ ] 1.6 No mobile regressions at 375 px
