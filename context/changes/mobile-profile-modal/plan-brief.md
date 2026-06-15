# Mobile Profile Modal — Plan Brief

> Full plan: `context/changes/mobile-profile-modal/plan.md`
> Research: `context/changes/mobile-profile-modal/research.md`

## What & Why

The mobile profile icon in the dashboard header is tappable but does nothing — it has no click handler. All three account actions (email display, add portfolio, sign out) live in a desktop-only `hidden sm:flex` container that is simply invisible below 640 px. This plan wires the icon to a Dialog modal so mobile users can access the same account actions as desktop users.

## Starting Point

`DashboardView.tsx:501-517` has a `<button className="flex sm:hidden">` rendering a `<User>` icon with no `onClick`. The `Dialog` component, `User` icon, `userEmail` prop, `openAddPortfolio()` function, and the `/api/auth/signout` POST endpoint are all already present in the file.

## Desired End State

Tapping the profile icon on mobile opens a centred "Account" dialog containing the user's email address, a full-width "+ Add portfolio" button (which opens the existing add-portfolio dialog and closes this one), and a full-width "Sign out" button that immediately POSTs to `/api/auth/signout`. Desktop layout is unchanged.

## Key Decisions Made

| Decision                    | Choice                            | Why (1 sentence)                                                       | Source   |
| --------------------------- | --------------------------------- | ---------------------------------------------------------------------- | -------- |
| Modal primitive             | `Dialog` (existing)               | Only modal primitive in the codebase; already imported                 | Research |
| Button styling inside modal | Inline styles from desktop header | Consistent design tokens (#dde4ee, #0a86d8) with zero new abstractions | Plan     |
| Sign-out UX                 | Immediate (no confirmation)       | Matches existing desktop behaviour; keeps flow simple                  | Plan     |
| Modal title                 | "Account"                         | Short, neutral, covers all three items                                 | Plan     |
| Modal width                 | `sm:max-w-xs`                     | Compact account popover feel vs full-form width                        | Plan     |

## Scope

**In scope:**

- One new `useState` boolean for modal open state in `DashboardView.tsx`
- `onClick` wired on existing mobile profile button (`DashboardView.tsx:502`)
- One new `<Dialog>` block with email, add-portfolio, and sign-out

**Out of scope:**

- No sign-out confirmation dialog
- No new UI components or files
- No changes to desktop layout
- No new imports

## Architecture / Approach

Three targeted edits to `DashboardView.tsx` only. The Dialog is appended after the last existing `</AlertDialog>` at line 888 before the root `</div>` at line 889. Styling copies the inline style objects from the desktop header (lines 457-498) verbatim, with `width: "100%"` added since the modal column is narrower.

## Phases at a Glance

| Phase                        | What it delivers                                 | Key risk                                                                           |
| ---------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1. Wire Mobile Profile Modal | Tappable profile icon → Account dialog on mobile | `sm:max-w-xs` could look too narrow on larger phones in landscape; verify manually |

**Prerequisites:** None — all primitives already in place  
**Estimated effort:** ~1 session, single file

## Open Risks & Assumptions

- `userEmail` is `string | undefined` — the email span is conditionally rendered (`userEmail &&`), so an unauthenticated render shows only the two buttons. Acceptable given the middleware always sets the user before the dashboard page renders.

## Success Criteria (Summary)

- Tapping the profile icon on any mobile viewport opens the "Account" dialog
- All three actions (email, add portfolio, sign out) work correctly
- Desktop layout has zero regression
