# Mobile Profile Modal Implementation Plan

## Overview

The mobile profile icon in the dashboard header is visible on viewports below 640 px (`sm` breakpoint) but has no click handler — tapping it does nothing. All three account actions (user email display, add-portfolio, sign out) exist on desktop inside a `hidden sm:flex` container and are simply invisible on mobile. This plan wires the icon to open a centred `Dialog` containing those three items.

## Current State Analysis

The placeholder button lives at `DashboardView.tsx:501-517`:

```
<button className="flex sm:hidden" style={...}>
  <User size={17} />
</button>
```

No `onClick`. No state. The `Dialog` component, `User` icon, `userEmail` prop, and `openAddPortfolio()` callback are all already in the file. The sign-out endpoint (`/api/auth/signout`, POST) is already in use by the desktop form at lines 482-498. Zero new imports, zero new files, zero API changes.

## Desired End State

Tapping the profile icon on mobile opens a small centred Dialog titled "Account" containing:

1. The user's email address (muted, numeric font — matches desktop display)
2. A "+ Add portfolio" button that opens the existing add-portfolio dialog and closes this modal
3. A "Sign out" button that immediately POSTs to `/api/auth/signout`

The modal is dismissible via the X close button or tapping the overlay. The desktop header (hidden on mobile) is unchanged.

### Key Discoveries

- `DashboardView.tsx:238` — portfolio dialog states; new state goes adjacent here
- `DashboardView.tsx:403-407` — `openAddPortfolio()` callback: resets form, sets `isAddPortfolioDialogOpen(true)`
- `DashboardView.tsx:452-499` — desktop `hidden sm:flex` block with all three items; these are the exact inline styles to replicate
- `DashboardView.tsx:501-517` — mobile button that needs `onClick`
- `DashboardView.tsx:888` — last `</AlertDialog>` before the root `</div>` at line 889; new Dialog goes between these two
- `src/components/ui/dialog.tsx:37-69` — `DialogContent` renders centred, has `showCloseButton` default true, width `max-w-[calc(100%-2rem)] sm:max-w-lg`

## What We're NOT Doing

- No sign-out confirmation — matches existing desktop behaviour (immediate form submit)
- No Sheet or drawer component — Dialog is the only modal primitive available and is sufficient
- No changes to desktop layout or desktop header
- No changes to any other file outside `DashboardView.tsx`
- No new imports (all primitives already imported on lines 13 and 23)

## Implementation Approach

Single phase, single file. Add one `useState` boolean for modal open state, wire `onClick` on the existing mobile button, and append one `<Dialog>` block before the root closing `</div>`. Button styling inside the modal copies the inline style objects from the desktop header (lines 455-498) — consistent design tokens, consistent hover behaviour, full-width for sign-out.

---

## Phase 1: Wire Mobile Profile Modal

### Overview

Three targeted edits to `src/components/transactions/DashboardView.tsx` only.

### Changes Required

#### 1. Add modal open state

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Introduce a boolean flag that the mobile button sets to `true` and the Dialog's `onOpenChange` uses to close.

**Contract**: Add `const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);` adjacent to the portfolio dialog states near line 238. No other state needed.

---

#### 2. Wire `onClick` on mobile profile button

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Make the existing mobile button (line 502) open the new modal. No other change to the button's markup or styles.

**Contract**: Add `onClick={() => setIsProfileModalOpen(true)}` to the button element at line 502. Leave all `style` props and the `User` icon unchanged.

---

#### 3. Add mobile profile Dialog block

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Render the centred Dialog that exposes email, add-portfolio, and sign-out to mobile users.

**Contract**: Insert the new `<Dialog>` block after the closing `</AlertDialog>` tag on line 888 and before the root `</div>` on line 889.

Structure:

- `<Dialog open={isProfileModalOpen} onOpenChange={setIsProfileModalOpen}>`
- `<DialogContent className="sm:max-w-xs">` — narrower than the default `sm:max-w-lg` to feel like a compact account popover rather than a full form dialog
- `<DialogHeader><DialogTitle>Account</DialogTitle></DialogHeader>`
- Body column (`display: flex, flexDirection: column, gap: 12`) containing:
  - Email span: rendered only when `userEmail` is truthy; `fontSize: 13, color: "#5e6e85", fontFamily: "var(--font-numeric)"` — exact match of desktop display at line 454
  - "+ Add portfolio" button: same inline styles as the desktop button at lines 457-481 (border `#dde4ee`, hover to `#0a86d8` with box-shadow); `onClick` calls `openAddPortfolio()` then `setIsProfileModalOpen(false)`; `width: "100%"` since the modal is narrow
  - Sign-out form: `<form method="POST" action="/api/auth/signout">` wrapping a full-width submit button; inline styles from the desktop sign-out button at lines 483-497; `width: "100%"` on the button

---

### Success Criteria

#### Automated Verification

- TypeScript compilation passes: `npm run typecheck`
- Lint passes: `npm run lint`

#### Manual Verification

- On a mobile viewport (< 640 px), tapping the profile icon opens the "Account" dialog
- The dialog displays the logged-in user's email address
- Tapping "+ Add portfolio" closes the profile modal and opens the existing add-portfolio dialog
- Tapping "Sign out" signs the user out and redirects to `/auth/signin`
- Tapping the X button or the overlay outside the dialog closes it
- On desktop (≥ 640 px), the profile icon is hidden (`sm:hidden`) — no regression to desktop layout

**Implementation Note**: After automated checks pass, do a quick manual smoke-test on a narrow viewport before marking complete. The `sm:max-w-xs` class constrains width at desktop breakpoints; verify the modal looks correct on both a 375 px mobile and a 768 px tablet width.

---

## Testing Strategy

### Manual Testing Steps

1. Open dashboard on a mobile viewport (375 px width) or browser DevTools mobile emulation
2. Tap the profile icon (top-right of header) → modal titled "Account" should appear
3. Confirm email address is displayed in muted style
4. Tap "+ Add portfolio" → profile modal should close, add-portfolio dialog should open
5. Dismiss add-portfolio dialog; re-open profile modal
6. Tap "Sign out" → should redirect to `/auth/signin` immediately
7. Resize to ≥ 640 px — confirm desktop header (email + buttons) visible and profile icon hidden

## References

- Research: `context/changes/mobile-profile-modal/research.md`
- Desktop header to replicate styles from: `DashboardView.tsx:452-499`
- Mobile button to wire: `DashboardView.tsx:501-517`
- Insertion point for Dialog: after `DashboardView.tsx:888`, before `DashboardView.tsx:889`
- Dialog component: `src/components/ui/dialog.tsx:37-69`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Wire Mobile Profile Modal

#### Automated

- [x] 1.1 TypeScript compilation passes: `npm run typecheck`
- [x] 1.2 Lint passes: `npm run lint`

#### Manual

- [ ] 1.3 Tapping profile icon on mobile opens "Account" dialog
- [ ] 1.4 Dialog displays user email, add-portfolio button, sign-out button
- [ ] 1.5 "+ Add portfolio" closes modal and opens add-portfolio dialog
- [ ] 1.6 "Sign out" redirects to `/auth/signin`
- [ ] 1.7 X / overlay dismisses dialog
- [ ] 1.8 No regression on desktop layout (≥ 640 px)
