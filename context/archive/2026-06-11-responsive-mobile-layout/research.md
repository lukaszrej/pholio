---
date: 2026-06-11T12:00:00+02:00
researcher: Claude Sonnet 4.6
git_commit: 7920cc912ee12952662d4c6871765f99cb1b252a
branch: main
repository: lukaszrej/pholio
topic: "Responsive mobile layout — sticky ticker column + chart legend below on mobile"
tags: [research, responsive, tailwind-v4, chart-js, sticky-column, mobile]
status: complete
last_updated: 2026-06-11
last_updated_by: Claude Sonnet 4.6
---

# Research: Responsive Mobile Layout

**Date**: 2026-06-11  
**Git Commit**: 7920cc912ee12952662d4c6871765f99cb1b252a  
**Branch**: main  
**Repository**: lukaszrej/pholio

## Research Question

Two responsive tasks:

1. Sticky ticker column on mobile with horizontal scroll on remaining columns in the portfolio table
2. Sector allocation chart legend moves below the doughnut on mobile (currently on the right)

Also: how to handle breakpoints and max-width for this type of app.

---

## Summary

The holdings table already has `overflow-x-auto` on its container but the ticker column has no `sticky` class. Adding `sticky left-0 z-10 bg-white` to the Ticker `<th>` and `<td>` cells is all that is needed for task 1 — no wrapper change required.

The sector allocation chart uses **Chart.js / react-chartjs-2** (not Recharts). The legend position is controlled via the `options.plugins.legend.position` prop — currently hardcoded to `"right"`. Switching to `"bottom"` on mobile requires a JS media-query hook because Chart.js has no native CSS breakpoints. The cleanest approach is a `useBreakpoint` hook (or inline `useMediaQuery`) that feeds a different `options` object.

The project is on **Tailwind v4.2.4** with CSS-first config (`@theme inline` in `global.css`) — no `tailwind.config.js` exists. The default `sm: 640px` / `md: 768px` breakpoints are active. Responsive class usage across the app is minimal (≤12 occurrences, mostly in shadcn/ui primitives).

---

## Detailed Findings

### 1. Holdings Table — `DashboardView.tsx`

**File:** `src/components/transactions/DashboardView.tsx`

| Element             | Line    | Current classes                                                         |
| ------------------- | ------- | ----------------------------------------------------------------------- |
| Container `<div>`   | 136     | `overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm` |
| `<table>`           | 137     | `w-full text-sm`                                                        |
| `<thead><tr>`       | 139     | `border-b border-gray-200 text-left text-gray-500`                      |
| All `<th>` (8 cols) | 140–147 | `px-4 py-3 font-medium`                                                 |
| **Ticker `<th>`**   | **140** | **`px-4 py-3 font-medium`**                                             |
| **Ticker `<td>`**   | **159** | **`px-4 py-3 font-semibold`** — plain text `{pos.ticker}`, not a link   |
| Last col `<th>`     | 147     | `w-8 px-2 py-3`                                                         |

Key facts:

- The container already has `overflow-x-auto` → horizontal scroll is already functional
- No `sticky`, `position`, `z-*`, or responsive classes exist anywhere in the table
- The ticker column is a plain `<td>` with text — no anchor or wrapper element to worry about

**What to add for sticky ticker:**

```tsx
// th (line 140): add sticky left-0 z-20 bg-white
<th className="sticky left-0 z-20 bg-white px-4 py-3 font-medium">Ticker</th>

// td (line 159): add sticky left-0 z-10 bg-white
<td className="sticky left-0 z-10 bg-white px-4 py-3 font-semibold">{pos.ticker}</td>
```

The `bg-white` background is mandatory — without it, scrolling columns bleed through the sticky cell visually (table cells are transparent by default).

`z-20` on the header cell ensures it sits above any sticky body cells (`z-10`) when the header row is also sticky (`top-0` could be added to `thead` for vertical stickiness, but that is out of scope for this task).

`overflow-x-auto` on the parent container is compatible with horizontal sticky columns — the column sticks to the left edge of the scroll container, which is exactly what we want.

**No CSS change is needed in `global.css`** — pure Tailwind class additions.

---

### 2. Sector Allocation Chart — `SectorAllocationChart.tsx`

**File:** `src/components/portfolio/SectorAllocationChart.tsx`

**Library:** Chart.js `^4.5.1` + react-chartjs-2 `^5.3.1` (NOT Recharts — important distinction)

| Element                                   | Line   | Current config                  |
| ----------------------------------------- | ------ | ------------------------------- |
| Chart container `<div>`                   | 74     | `relative h-[300px]`            |
| `<Doughnut>`                              | 75     | `data={data} options={options}` |
| `options.responsive`                      | 50     | `true`                          |
| `options.maintainAspectRatio`             | 51     | `false`                         |
| **`options.plugins.legend.position`**     | **54** | **`"right" as const`**          |
| `options.plugins.legend.labels.color`     | 56     | `"rgb(55, 65, 81)"` (gray-700)  |
| `options.plugins.legend.labels.padding`   | 57     | `12`                            |
| `options.plugins.legend.labels.font.size` | 58     | `12`                            |

Parent wrapper in DashboardView.tsx (line 258): `mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm`

**Key fact:** Chart.js legend position is part of the `options` JavaScript object passed to `<Doughnut>` — there is no CSS-only solution. Changing it requires conditional logic at the React level.

**Approach — `useMediaQuery` hook in the component:**

```tsx
// Simple hook (no external deps):
function useIsSmall() {
  const [isSmall, setIsSmall] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 768 : false));
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsSmall(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isSmall;
}
```

Then inside `SectorAllocationChart.tsx`:

```tsx
const isSmall = useIsSmall();

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: (isSmall ? "bottom" : "right") as "bottom" | "right",
      labels: {
        color: "rgb(55, 65, 81)",
        padding: 12,
        font: { size: 12 },
      },
    },
  },
};
```

This correctly uses `matchMedia` (event-driven, no `resize` polling) and handles SSR by defaulting to `false` (server renders as desktop).

**No chart container height change is needed** — Chart.js with `maintainAspectRatio: false` and a fixed `h-[300px]` container will reflow the legend internally when `position` changes. If the legend is taller when stacked below (wrapping), consider bumping the container height on mobile: `className={isSmall ? "relative h-[360px]" : "relative h-[300px]"}`.

---

### 3. Tailwind v4 Setup & Breakpoints

**File:** `src/styles/global.css`

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --radius-sm: ...;
  --color-background: ...;
  /* etc — color tokens, no custom breakpoints */
}

@layer base { ... }

@utility bg-cosmic {
  background-image: linear-gradient(to bottom, #f8fafc, #f1f5f9, #f8fafc);
}
```

No custom breakpoints defined → **Tailwind v4 defaults are active:**

| Prefix | Min-width |
| ------ | --------- |
| `sm`   | 640px     |
| `md`   | 768px     |
| `lg`   | 1024px    |
| `xl`   | 1280px    |
| `2xl`  | 1536px    |

Max-width variants built-in: `max-sm:`, `max-md:`, `max-lg:`, etc.

**Viewport meta** (Layout.astro line 18): `width=device-width` — missing `initial-scale=1`. Should be fixed to `width=device-width, initial-scale=1` — without it, iOS Safari may render at a zoomed-out scale and ignore responsive breakpoints.

**Existing breakpoint usage:** Very sparse — only `sm:grid-cols-3` in `PortfolioSummaryCard.tsx:20` for app-level layout. The rest are shadcn/ui primitives.

**No global max-width container pattern** exists. The project uses padding/margin for layout constraints.

---

### 4. External Research (Exa AI) — Key Patterns

#### Sticky column in scrollable table (Tailwind)

- `sticky left-0` must be on individual `<th>`/`<td>` cells, NOT on `<tr>`, `<thead>`, or `<tbody>` — those elements do not support `position: sticky`
- Background (`bg-white`) is mandatory on sticky cells — transparent cells let scroll content bleed through
- Z-index: sticky header cell `z-20`, sticky body cells `z-10`
- `overflow-x-auto` on the wrapper IS compatible with horizontal sticky columns (the column sticks to the left edge of the scroll container)
- If vertical sticky headers (`thead`) are also desired later, use `overflow: auto clip` (inline style) instead of `overflow-x-auto` — this is a CSS quirk where `overflow-x: auto` forces `overflow-y: auto` on the same element, trapping vertically-sticky elements inside the wrapper. For horizontal-only scroll + column stickiness, `overflow-x-auto` is fine.

#### Chart.js legend positioning

- For **Chart.js** (this project's library): legend position is JavaScript-only via `options.plugins.legend.position`
- Options: `"right"` (default), `"bottom"`, `"top"`, `"left"`, `"chartArea"`
- No native breakpoint support — requires JS media query for responsive switching
- `position: "bottom"` with `labels.padding: 12` and `align: "center"` gives a clean stacked legend below the doughnut
- Note: The Exa research covered Recharts; for Chart.js the equivalent of Recharts' `verticalAlign="bottom"` is `plugins.legend.position: "bottom"`

#### Tailwind v4 max-width pattern for dashboard apps

Most common pattern (matches shadcn/ui, Tailwind UI):

```html
<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"></div>
```

- `max-w-7xl` = 1280px — de facto standard for dashboards
- Use `max-w-screen-2xl` (1536px) only for very wide data tables
- For component-level responsiveness independent of viewport, use **container queries** (`@container` + `@sm:`, `@md:` prefixes) — supported natively in Tailwind v4

---

## Code References

- `src/components/transactions/DashboardView.tsx:136` — table container with `overflow-x-auto`
- `src/components/transactions/DashboardView.tsx:140` — Ticker `<th>` — add `sticky left-0 z-20 bg-white`
- `src/components/transactions/DashboardView.tsx:159` — Ticker `<td>` — add `sticky left-0 z-10 bg-white`
- `src/components/portfolio/SectorAllocationChart.tsx:54` — `position: "right"` → make conditional on breakpoint
- `src/components/portfolio/SectorAllocationChart.tsx:74` — chart container height, may need `h-[360px]` on mobile
- `src/components/transactions/DashboardView.tsx:258` — chart parent wrapper
- `src/styles/global.css:1–90` — Tailwind v4 theme config, no custom breakpoints
- `src/layouts/Layout.astro:18` — viewport meta (missing `initial-scale=1`)

---

## Architecture Insights

1. **Tailwind v4, CSS-first** — No `tailwind.config.js`. Custom breakpoints go in `global.css` under `@theme { --breakpoint-xs: 30rem; }`. Default sm/md/lg are active and sufficient for these tasks.

2. **Chart.js legend is JS-controlled** — Unlike CSS-based legends, Chart.js legend position is part of the `options` object. Mobile responsiveness requires a `useMediaQuery`/`matchMedia` hook — there is no CSS-only path.

3. **Table sticky columns need per-cell classes** — `position: sticky` on `<td>`/`<th>` works with the existing `overflow-x-auto` parent. No structural change to the table needed — only class additions on the ticker column cells.

4. **Background color on sticky cells** — This is a frequent oversight. The sticky ticker cells need explicit `bg-white` (matching the card background) to avoid visual bleed-through.

5. **Container queries available** — Tailwind v4 ships `@container` support out of the box. If chart cards are ever reused in different layout contexts, `@container` variants (`@md:flex-row`) are the idiomatic responsive approach — viewport breakpoints are secondary.

---

## Open Questions

1. **Dark mode** — The project has a `dark` custom variant (`&:is(.dark *)`). Sticky cells need `dark:bg-gray-900` (or whatever the dark card background is) in addition to `bg-white`, otherwise they will show the wrong background in dark mode. Check if dark mode is actively used before adding dark variants.

2. **Expand/collapse rows** — `DashboardView.tsx` has an expand/collapse column (line 147, `w-8 px-2 py-3`). If expanded rows have additional cells that should also scroll, verify that the expanded content respects the same table structure.

3. **Chart container height** — Setting `position: "bottom"` will make the legend wrap into 1–2 rows depending on number of sectors. The current fixed `h-[300px]` container may need to be `h-[360px]` on mobile to avoid legend clipping. Verify in browser after implementing.

4. **Viewport meta** — `Layout.astro:18` is missing `initial-scale=1`. This should be fixed as part of this change to ensure responsive breakpoints work correctly on iOS Safari.
