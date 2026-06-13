# Responsive Mobile Layout Implementation Plan

## Overview

Make the portfolio dashboard usable on mobile viewports: sticky Ticker column in the holdings table (remaining columns scroll horizontally), and Sector Allocation chart legend repositioned below the doughnut on mobile. Includes a prerequisite viewport meta fix required for iOS Safari to respect responsive breakpoints.

## Current State Analysis

- `src/layouts/Layout.astro:18` — `content="width=device-width"` — missing `initial-scale=1`; iOS Safari may auto-zoom and ignore breakpoints
- `src/components/transactions/DashboardView.tsx:136` — table wrapper already has `overflow-x-auto`; no sticky classes exist anywhere in the table
- `DashboardView.tsx:140` — Ticker `<th>`: `px-4 py-3 font-medium` (no sticky, no background)
- `DashboardView.tsx:153` — data `<tr>`: `cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50` — uses `hover:`, not `group-hover:`; sticky cells with `bg-white` will not participate in this hover without the `group` pattern
- `DashboardView.tsx:159` — Ticker `<td>`: `px-4 py-3 font-semibold` (no sticky, no background)
- `DashboardView.tsx:184` — expanded `<td colSpan={8}>`: no `overflow-x-auto`; inner sub-table may overflow on narrow screens
- `src/components/portfolio/SectorAllocationChart.tsx:54` — `position: "right" as const` — hardcoded; no breakpoint logic
- `SectorAllocationChart.tsx:74` — container `"relative h-[300px]"` — fixed height; legend below the chart needs more space
- Project uses Tailwind v4.2.4 CSS-first (no `tailwind.config.js`); default `md: 768px` breakpoint is active
- Dark mode classes exist only in shadcn/ui primitives — app-level components are light-only, so sticky cells only need `bg-white`

## Desired End State

On viewports narrower than 768px:

- The Ticker column stays pinned to the left edge while the user scrolls the table horizontally through the remaining 7 columns
- The full-row hover highlight (gray-50) covers the sticky Ticker cell correctly
- Expanded transaction sub-rows scroll horizontally if their columns overflow
- The Sector Allocation doughnut chart displays its legend below the chart, not to the right

On viewports 768px and wider: no visual change from the current state.

### Key Discoveries

- `DashboardView.tsx:136` — `overflow-x-auto` already present; no wrapper change needed for sticky column support
- `DashboardView.tsx:153` — `hover:bg-gray-50` on `<tr>` does not propagate to `<td>` children because `background-color` is not CSS-inherited; sticky cells need explicit `group`/`group-hover:` handling
- `SectorAllocationChart.tsx:26` — early return before props processing; the `useIsSmall` hook call must precede this early return (React rules of hooks)
- `SectorAllocationChart.tsx:54` — `"right" as const` types the literal narrowly; the conditional expression `(isSmall ? "bottom" : "right")` must be typed as `"bottom" | "right"` to satisfy Chart.js
- Chart.js legend position is JavaScript-only — there is no CSS-only path for responsive repositioning

## What We're NOT Doing

- Sticky `<thead>` (vertically sticky header row) — out of scope
- Adding a max-width container layout to the dashboard
- Dark mode variants on sticky cells — dark mode not active at app level
- Custom breakpoints in `@theme` — default `md: 768px` is sufficient
- Moving `useIsSmall` to a shared hooks file — single usage; inline is cleaner

## Implementation Approach

Two sequential phases. Phase 1 is pure class additions (no new logic). Phase 2 adds a small `useEffect` hook. Each phase is independently verifiable and shippable.

## Critical Implementation Details

**Hook placement before early return** — `SectorAllocationChart.tsx` has an early `if (slices.length === 0) return (...)` at line 26. The `useIsSmall()` call must appear before this guard — React forbids hooks after a conditional return. Place it as the first line of the component body.

**TypeScript type for conditional legend position** — `"right" as const` narrows to the literal type `"right"`. The ternary replacement must be typed explicitly: `(isSmall ? "bottom" : "right") as "bottom" | "right"`. Using `as const` on a ternary widens to `string`, which Chart.js rejects.

**SSR hydration safety** — `useIsSmall` initializes to `false` (desktop). `useEffect` updates it on the client after mount. This means on mobile, the legend briefly shows on the right until hydration fires — acceptable because Chart.js renders into `<canvas>` and a single repaint is imperceptible. Do not initialize from `window.innerWidth` in `useState` — that causes a server/client mismatch in Astro's SSR.

---

## Phase 1: Viewport Meta + Sticky Ticker Column

### Overview

Three files change: `Layout.astro` (1-word viewport fix), and `DashboardView.tsx` (class additions to ticker cells and expanded row). No new imports or logic required.

### Changes Required

#### 1. Viewport meta tag

**File**: `src/layouts/Layout.astro`

**Intent**: Add `initial-scale=1` to the viewport meta so iOS Safari honours responsive breakpoints rather than auto-zooming.

**Contract**: Line 18 — change `content="width=device-width"` → `content="width=device-width, initial-scale=1"`.

---

#### 2. Sticky Ticker header cell

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Pin the Ticker column header to the left edge of the scroll container so the column label remains visible as the user scrolls right.

**Contract**: Line 140 — add `sticky left-0 z-20 bg-white` to the existing `px-4 py-3 font-medium` class string on the Ticker `<th>`.

---

#### 3. Data row group + sticky Ticker data cell

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Pin each Ticker data cell and preserve the full-row hover highlight for it. The existing `hover:bg-gray-50` on `<tr>` does not reach explicit-background `<td>` children; the `group`/`group-hover:` pattern fixes this.

**Contract**:

- Line 153 — add `group` to the existing `<tr>` class string (`cursor-pointer border-b ...`)
- Line 159 — add `sticky left-0 z-10 bg-white group-hover:bg-gray-50` to the existing `px-4 py-3 font-semibold` class string on the Ticker `<td>`

---

#### 4. Expanded sub-row horizontal scroll

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Allow the expanded transaction detail sub-table to scroll horizontally on narrow screens rather than overflowing its container.

**Contract**: Line 184 — add `overflow-x-auto` to the existing `bg-gray-50 px-6 pt-1 pb-3` class string on the `<td colSpan={8}>`.

---

### Success Criteria

#### Automated Verification

- Type check passes: `npm run typecheck`
- Lint passes: `npm run lint`

#### Manual Verification

- On a viewport < 768px, scrolling the table horizontally keeps the Ticker column pinned at the left edge while other columns scroll behind it
- The full-row hover highlight (gray-50) covers the sticky Ticker cell — no white gap on hover
- Expanded transaction sub-rows can scroll horizontally when their content overflows
- No visual bleed-through from scrolling columns behind the sticky Ticker cell

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Responsive Chart Legend

### Overview

`SectorAllocationChart.tsx` gains a `useIsSmall` hook (defined above the component) and a conditional `options.plugins.legend.position`. The container height gains a Tailwind breakpoint to give the bottom legend room on mobile. No changes to `DashboardView.tsx`.

### Changes Required

#### 1. React import update

**File**: `src/components/portfolio/SectorAllocationChart.tsx`

**Intent**: Bring in `useState` and `useEffect` for the media-query hook.

**Contract**: Line 1 imports — add `import { useState, useEffect } from "react";` (new import line at the top, after the existing chart.js and react-chartjs-2 imports).

---

#### 2. useIsSmall hook

**File**: `src/components/portfolio/SectorAllocationChart.tsx`

**Intent**: Provide a reactive boolean that is `true` when the viewport is narrower than 768px, updating live on resize.

**Contract**: Define `useIsSmall` as a module-level function above the `SectorAllocationChart` export. Initialize state to `false` (SSR-safe); `useEffect` sets `mq.matches` on mount and subscribes to `MediaQueryListEvent` for live updates:

```ts
function useIsSmall() {
  const [isSmall, setIsSmall] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsSmall(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsSmall(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isSmall;
}
```

---

#### 3. Hook call before early return

**File**: `src/components/portfolio/SectorAllocationChart.tsx`

**Intent**: Call `useIsSmall` at the very start of the component body so it satisfies React's rules-of-hooks (no conditional hook calls).

**Contract**: First line of `SectorAllocationChart` component body (before the `if (slices.length === 0)` guard at line 26) — add `const isSmall = useIsSmall();`.

---

#### 4. Conditional legend position

**File**: `src/components/portfolio/SectorAllocationChart.tsx`

**Intent**: Switch the Chart.js legend from the right side to below the doughnut when on a mobile viewport.

**Contract**: Line 54 — replace `position: "right" as const` with `position: (isSmall ? "bottom" : "right") as "bottom" | "right"`.

---

#### 5. Responsive container height

**File**: `src/components/portfolio/SectorAllocationChart.tsx`

**Intent**: Give the chart container extra height on mobile so the bottom-positioned legend has room without clipping the doughnut.

**Contract**: Line 74 — change `className="relative h-[300px]"` to `className="relative h-[380px] md:h-[300px]"`. This is a pure Tailwind breakpoint class — no JS dependency.

---

### Success Criteria

#### Automated Verification

- Type check passes: `npm run typecheck`
- Lint passes: `npm run lint`

#### Manual Verification

- On a viewport < 768px, the Sector Allocation legend appears below the doughnut with all labels visible and unclipped
- On a viewport ≥ 768px, the legend appears to the right of the doughnut (no change from current state)
- Resizing the browser window between mobile and desktop widths switches the legend position live without a page reload
- The doughnut itself is not clipped or distorted on either viewport

**Implementation Note**: After automated verification passes, confirm legend positioning manually in both mobile and desktop viewport sizes before marking complete.

---

## Testing Strategy

### Manual Testing Steps

1. Open the dashboard in Chrome DevTools with device toolbar set to 375px width (iPhone SE)
2. Verify Ticker column stays pinned while scrolling the table right
3. Hover over a portfolio row — confirm gray-50 highlight covers the Ticker cell
4. Expand a row — verify the sub-table scrolls if it overflows
5. Scroll down to the Sector Allocation chart — confirm legend is below the doughnut
6. Switch DevTools to 1024px — confirm legend returns to the right side
7. Resize the window from narrow to wide and back — confirm live legend switch

## References

- Research doc: `context/changes/responsive-mobile-layout/research.md`
- Table container: `src/components/transactions/DashboardView.tsx:136`
- Chart legend config: `src/components/portfolio/SectorAllocationChart.tsx:52-60`
- Viewport meta: `src/layouts/Layout.astro:18`
- Tailwind theme config: `src/styles/global.css`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Viewport Meta + Sticky Ticker Column

#### Automated

- [x] 1.1 Type check passes (`npm run typecheck`) — ed81fe2
- [x] 1.2 Lint passes (`npm run lint`) — ed81fe2

#### Manual

- [x] 1.3 Ticker column is sticky on narrow viewport (< 768px) — ed81fe2
- [x] 1.4 Full-row hover highlight covers the sticky Ticker cell (group-hover) — ed81fe2
- [x] 1.5 Expanded sub-rows scroll horizontally on mobile — ed81fe2
- [x] 1.6 No visual bleed-through behind the sticky Ticker column — ed81fe2

### Phase 2: Responsive Chart Legend

#### Automated

- [x] 2.1 Type check passes (`npm run typecheck`) — 0982fd7
- [x] 2.2 Lint passes (`npm run lint`) — 0982fd7

#### Manual

- [x] 2.3 Legend appears below doughnut on viewport < 768px — 0982fd7
- [x] 2.4 Legend appears to the right of doughnut on viewport ≥ 768px — 0982fd7
- [x] 2.5 Legend labels fully visible and unclipped on mobile — 0982fd7
- [x] 2.6 Legend position switches live on browser resize — 0982fd7
