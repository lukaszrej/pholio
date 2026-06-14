# UI Max-Width, Portfolio Table, and Nav Tab Centering — Plan Brief

> Full plan: `context/changes/ui-max-width-and-nav-fixes/plan.md`
> Research: `context/changes/ui-max-width-and-nav-fixes/research.md`

## What & Why

Restore three visual regressions introduced when the Terminal-Light design was rewritten (commit `f728841`): the dashboard lost its centred max-width container, the holdings table stopped filling its grid column, and nav tab labels became left-aligned relative to their ink underline.

## Starting Point

The root `DashboardView` div has no max-width constraint; every section stretches full viewport. `.holdings-table` is set to `display: table` on desktop, which makes it shrink to content width. `tabBtnStyle` has `alignItems: "center"` but no `justifyContent: "center"`.

## Desired End State

On wide screens: TickerTape spans edge-to-edge; all other content is centred at 1024 px with visible gray gutters. The individual portfolio holdings table fills its `1fr` column. Nav tab labels (with or without count badges) are visually centred beneath the blue ink underline.

## Key Decisions Made

| Decision                    | Choice                      | Why (1 sentence)                                                       | Source              |
| --------------------------- | --------------------------- | ---------------------------------------------------------------------- | ------------------- |
| Max-width value             | 1024 px                     | Matches the previous `max-w-6xl` implementation the user remembers     | User (this session) |
| TickerTape exception        | Full-bleed, outside wrapper | User explicitly specified it as the only full-width element            | Research            |
| Phase structure             | Single phase                | All three fixes are independent one-liners; testing once is sufficient | Plan                |
| Modals outside wrapper      | Yes                         | Portal-rendered elements ignore DOM parent for positioning             | Research            |
| holdings-table fix approach | CSS `display: block`        | Corrects the shrink-to-content behaviour without any JSX change        | Research            |
| justifyContent approach     | Add to tabBtnStyle          | Centres content without touching the ink-bar calculation               | Research            |

## Scope

**In scope:**

- Max-width wrapper around header, nav tabs, main content, mobile CTA (`DashboardView.tsx`)
- `display: block` fix for `.holdings-table` on `global.css:173`
- `justifyContent: "center"` in `tabBtnStyle` (`DashboardView.tsx:96`)

**Out of scope:**

- TickerTape interior layout
- Ink-bar calculation logic
- Any spacing, padding, or colour token changes
- Changes to `PortfolioSection.tsx`

## Architecture / Approach

Two files, three line-level changes. `DashboardView.tsx` gets a wrapper div after `<TickerTape />` with `style={{ maxWidth: 1024, margin: "0 auto" }}`, closing before the portal-rendered modals. `global.css:173` flips one word. `tabBtnStyle` gains one property.

## Phases at a Glance

| Phase                      | What it delivers                                              | Key risk                                                                                      |
| -------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1. Three Surgical UI Fixes | All three visual regressions resolved, lint + typecheck green | Wrapper placement: if closed too early or too late, sections fall outside/inside unexpectedly |

**Prerequisites:** None  
**Estimated effort:** ~15 minutes implementation + manual verification on a wide screen

## Open Risks & Assumptions

- The white header background will be constrained to 1024 px on wide screens, showing gray gutters — this matches the "previous version" the user remembers and is the intended outcome.
- The mobile-cta-bar uses `position: fixed` in CSS, so its DOM parent doesn't affect its visual position; it is safely wrapped inside the max-width div.

## Success Criteria (Summary)

- TickerTape is the only full-bleed element; all other content has visible side margins at ≥1280 px
- Holdings table fills the full `1fr` column with no wasted space beside the sidebar
- Nav tab ink underline is centred under each label at rest and after animation
