# App Max-Width Implementation Plan

## Overview

Cap the dashboard content width at 1280px (`max-w-7xl`) and center it on wide desktop viewports. The `bg-cosmic` gradient background continues to fill the full viewport.

## Current State Analysis

`DashboardView.tsx` renders a single root `<div className="bg-cosmic min-h-screen p-6 text-gray-900">` with no width constraint. On large monitors (≥1440px) the content stretches edge-to-edge, making table rows hard to scan and line lengths excessive.

## Desired End State

Dashboard content is centered within a 1280px container on wide viewports. Background gradient stays full-bleed. Padding (24px horizontal, 24px vertical) is preserved from the original `p-6`.

### Key Discoveries

- All dashboard content lives inside a single root div in `src/components/transactions/DashboardView.tsx:200`
- No other page layout files need changes — `Layout.astro` is a pass-through wrapper
- Tailwind `max-w-7xl` = 1280px, suitable for data-heavy dashboard with 8-column tables

## What We're NOT Doing

- Changing auth pages, marketing pages, or any other route
- Adding per-breakpoint padding adjustments (existing `p-6` equivalent is sufficient)
- Touching `Layout.astro` or `global.css`

## Implementation Approach

Wrap the existing content in an inner centered div, keeping the outer div as a full-bleed background shell.

## Phase 1: Constrain dashboard content width

### Overview

Split the root div into a full-bleed background shell and a centered `max-w-7xl` content wrapper.

### Changes Required

#### 1. DashboardView root div

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Remove padding from the outer (background) div and add an inner div with `mx-auto max-w-7xl px-6 py-6` that constrains and centers all content.

**Contract**: Outer div retains `bg-cosmic min-h-screen text-gray-900`. Inner div wraps every child node from the toolbar through the final AlertDialog.

### Success Criteria

#### Automated Verification

- TypeScript passes: `npx tsc --noEmit`

#### Manual Verification

- On a viewport ≥1440px the content column is visibly centered with equal whitespace on both sides
- Background gradient fills the full viewport width behind the content
- No layout regressions on tablet (768px) or mobile (375px)
- Dialogs and modals still appear centered correctly

---

## Testing Strategy

### Manual Testing Steps

1. Open `/dashboard` in a browser at ≥1440px viewport width — content should be centered at ~1280px
2. Resize to 768px — layout should remain full-width and readable
3. Open Add Portfolio dialog — should still be centered over the page
4. Scroll to bottom on a long portfolio list — no horizontal overflow

## References

- Modified file: `src/components/transactions/DashboardView.tsx:200`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Constrain dashboard content width

#### Automated

- [x] 1.1 TypeScript passes: `npx tsc --noEmit`

#### Manual

- [x] 1.2 Content centered with equal margins at ≥1440px viewport
- [x] 1.3 Background gradient full-bleed
- [x] 1.4 No layout regressions on tablet/mobile
- [x] 1.5 Dialogs still centered correctly
