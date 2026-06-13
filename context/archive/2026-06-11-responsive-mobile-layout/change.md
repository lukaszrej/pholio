---
id: responsive-mobile-layout
title: Responsive mobile layout — sticky ticker column + legend below chart
status: archived
archived_at: 2026-06-11T14:33:42Z
created: 2026-06-11
updated: 2026-06-11
---

## What

Make the portfolio app responsive on mobile:

1. Sticky ticker column in the holdings table — rest of columns scroll horizontally
2. Sector allocation chart legend moves below the doughnut on mobile (currently pinned right)

## Why

The dashboard is currently desktop-only in its layout. On narrow viewports the holdings table overflows uncontrolled and the chart legend is unusable.

## Scope

- `src/components/transactions/DashboardView.tsx` — table
- `src/components/portfolio/SectorAllocationChart.tsx` — chart legend
- `src/styles/global.css` — optional breakpoint helpers if needed
