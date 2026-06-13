# Responsive Mobile Layout — Plan Brief

> Full plan: `context/changes/responsive-mobile-layout/plan.md`
> Research: `context/changes/responsive-mobile-layout/research.md`

## What & Why

The portfolio dashboard is currently desktop-only in its layout. On narrow viewports the holdings table overflows uncontrolled and the Sector Allocation chart legend is unusable. This change makes two targeted improvements — sticky ticker column and responsive chart legend — along with a prerequisite viewport meta fix.

## Starting Point

The table wrapper already has `overflow-x-auto` (DashboardView.tsx:136), so horizontal scrolling works. The Ticker `<th>` and `<td>` cells just need `sticky left-0 bg-white`. The chart legend is hardcoded to `position: "right"` in the Chart.js options object (SectorAllocationChart.tsx:54) — switching it requires a JS media-query hook since Chart.js has no CSS breakpoints.

## Desired End State

On viewports narrower than 768px: the Ticker column stays pinned to the left while the rest of the table scrolls horizontally, and the Sector Allocation legend appears below the doughnut with all labels visible. Desktop behaviour is unchanged.

## Key Decisions Made

| Decision                    | Choice                                     | Why (1 sentence)                                                                                 | Source   |
| --------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ | -------- |
| Hover state on sticky cells | `group`/`group-hover:` pattern             | `background-color` is not CSS-inherited; without `group`, sticky cells stay white on row hover   | Plan     |
| Expanded sub-rows on mobile | Add `overflow-x-auto` to expanded `<td>`   | 1-line fix prevents the inner sub-table from overflowing its container                           | Plan     |
| Mobile/desktop breakpoint   | `md` — 768px                               | Industry-standard mobile/tablet split; aligns with `matchMedia("(max-width: 767px)")`            | Plan     |
| Viewport meta fix           | Include in this change                     | Missing `initial-scale=1` breaks iOS Safari breakpoint behaviour; prerequisite for both features | Plan     |
| Legend position approach    | JS `matchMedia` hook                       | Chart.js legend position is JavaScript-only; no CSS path exists                                  | Research |
| Chart container height      | `h-[380px] md:h-[300px]`                   | Bottom legend needs ~80px extra space; pure Tailwind, no JS                                      | Plan     |
| Hook initialization         | `useState(false)` — always false on server | Prevents React hydration mismatch on Astro SSR; `useEffect` corrects to `mq.matches` on client   | Plan     |
| `useIsSmall` location       | Inline in `SectorAllocationChart.tsx`      | Single usage; a shared hooks file would be over-engineering                                      | Plan     |

## Scope

**In scope:**

- `src/layouts/Layout.astro` — add `initial-scale=1` to viewport meta
- `src/components/transactions/DashboardView.tsx` — sticky Ticker th/td, group-hover, expanded sub-row overflow
- `src/components/portfolio/SectorAllocationChart.tsx` — `useIsSmall` hook, conditional legend position, responsive container height

**Out of scope:**

- Sticky `<thead>` (vertical sticky header row)
- Max-width container / dashboard layout restructure
- Dark mode variants on sticky cells
- Custom breakpoints in `@theme`
- Any other components

## Architecture / Approach

Phase 1 is pure class additions — no new imports or logic. Phase 2 adds a 10-line `useEffect` hook. Both phases are independently shippable and have no shared state. The hook is module-level in `SectorAllocationChart.tsx` and must be called before the component's early return guard (React rules of hooks).

## Phases at a Glance

| Phase                            | What it delivers                                                            | Key risk                                                         |
| -------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1. Viewport meta + sticky column | Sticky Ticker column with correct hover; expanded rows scroll; iOS meta fix | Forgotten `bg-white` on sticky cells → bleed-through             |
| 2. Responsive chart legend       | Legend below doughnut on mobile; live on resize                             | Hook initialized after early return → React rules-of-hooks error |

**Prerequisites:** None — the table scroll container and Chart.js are already in place.  
**Estimated effort:** ~1 session across 2 phases (< 30 min implementation).

## Open Risks & Assumptions

- On mobile, the legend briefly renders on the right before `useEffect` fires (single canvas repaint — imperceptible in practice)
- If a portfolio has many sectors (> 8), the 380px mobile container may still be tight — acceptable; can be tuned after visual testing

## Success Criteria (Summary)

- Ticker column stays pinned when scrolling the table on a 375px viewport
- Sector Allocation legend appears below the doughnut on mobile and to the right on desktop
- Row hover highlight covers the sticky Ticker cell (no white gap)
