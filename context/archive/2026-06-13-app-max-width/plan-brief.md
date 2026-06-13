# App Max-Width — Plan Brief

> Full plan: `context/changes/app-max-width/plan.md`

## What & Why

Dashboard content stretched edge-to-edge on wide desktop viewports (≥1440px), making table rows hard to scan. Capping content width at 1280px and centering it improves readability without affecting the background or mobile layout.

## Starting Point

A single root div in `DashboardView.tsx` carried both the full-bleed `bg-cosmic` background and the `p-6` padding with no width constraint.

## Desired End State

Content is centered in a 1280px column on wide screens. The gradient background still covers the full viewport. Tablet and mobile layouts are unaffected.

## Key Decisions Made

| Decision            | Choice                                      | Why (1 sentence)                                                                              | Source |
| ------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ |
| Max-width value     | `max-w-7xl` (1280px)                        | Standard for data-heavy dashboards per UX research; fits 8-column portfolio table comfortably | Plan   |
| Background handling | Full-bleed outer shell + centered inner div | Keeps the gradient edge-to-edge while constraining content                                    | Plan   |
| Scope               | DashboardView only                          | Auth and other pages are not wide enough to need this yet                                     | Plan   |

## Scope

**In scope:** `DashboardView.tsx` root layout

**Out of scope:** Auth pages, `Layout.astro`, `global.css`, per-breakpoint padding changes

## Architecture / Approach

Outer div = full-bleed background shell (`bg-cosmic min-h-screen`). Inner div = centered content wrapper (`mx-auto max-w-7xl px-6 py-6`). No routing, state, or API changes.

## Phases at a Glance

| Phase                                | What it delivers                                 | Key risk                                                |
| ------------------------------------ | ------------------------------------------------ | ------------------------------------------------------- |
| 1. Constrain dashboard content width | Centered 1280px content column on wide viewports | Modal/dialog centering could break (verified: no issue) |

**Prerequisites:** None  
**Estimated effort:** ~5 minutes (already implemented)

## Open Risks & Assumptions

- If the app gains full-width data tables or charts, the 1280px cap may need to be widened to `max-w-screen-2xl` (1536px)

## Success Criteria (Summary)

- Content is visibly centered with equal margins at ≥1440px viewport
- Background gradient remains full-bleed
- No regressions on tablet or mobile layouts
