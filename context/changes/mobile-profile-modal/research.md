---
date: 2026-06-15T00:00:00+00:00
researcher: Claude Sonnet 4.6
git_commit: 373545092cdfac8970991006e716c6b4cc166647
branch: main
repository: Pholio
topic: "Mobile profile modal — profile icon tap shows nothing on mobile"
tags: [research, mobile, navigation, profile, auth, dialog]
status: complete
last_updated: 2026-06-15
last_updated_by: Claude Sonnet 4.6
---

# Research: Mobile Profile Modal

**Date**: 2026-06-15  
**Researcher**: Claude Sonnet 4.6  
**Git Commit**: `373545092cdfac8970991006e716c6b4cc166647`  
**Branch**: main  
**Repository**: Pholio

## Research Question

On mobile viewports the user profile icon in the header is visible but tapping it does nothing. Need to create a profile modal for mobile with sign-out button, add-portfolio button, and user email address.

## Summary

The mobile profile icon (`<button className="flex sm:hidden">` at `DashboardView.tsx:502`) has **no click handler** — it is a placeholder. All desktop-only actions (email display, "+ Add portfolio", "Sign out") live in a sibling `<div className="hidden ... sm:flex">` at `DashboardView.tsx:452-499` and are simply invisible on mobile. The fix is self-contained to `DashboardView.tsx`: add one `useState` flag, wire `onClick` on the existing mobile button, and add a `<Dialog>` (already imported) containing the three items. No new component files are needed.

## Detailed Findings

### Mobile profile button — no onClick

- **File**: `src/components/transactions/DashboardView.tsx:501-517`
- The button renders `<User size={17} />` (lucide-react, already imported on line 23)
- `className="flex sm:hidden"` — visible only below 640 px (`sm` breakpoint)
- **No `onClick`, no state tied to it** — it is a pure visual placeholder

```tsx
<button
  className="flex sm:hidden"
  style={{
    width: 34,
    height: 34,
    border: "1px solid #dde4ee",
    borderRadius: 6,
    background: "#fff",
    alignItems: "center",
    justifyContent: "center",
    color: "#5e6e85",
    cursor: "pointer",
  }}
>
  <User size={17} />
</button>
```

### Desktop-only header content (hidden on mobile)

- **File**: `src/components/transactions/DashboardView.tsx:452-499`
- `className="hidden items-center gap-3 sm:flex"` — completely invisible below 640 px
- Contains:
  - **User email**: `{userEmail && <span className="font-numeric">{userEmail}</span>}` (line 454)
  - **"+ Add portfolio" button**: calls `openAddPortfolio()` (line 456) — which sets `isAddPortfolioDialogOpen` to `true` (state at line 238)
  - **"Sign out" form**: `<form method="POST" action="/api/auth/signout">` (lines 482-498)

### Sign-out endpoint

- **File**: `src/pages/api/auth/signout.ts:1-10`
- Accepts `POST`, calls `supabase.auth.signOut()`, redirects to `/auth/signin`
- Desktop triggers it via an HTML form submit — the same approach works for mobile

### User email data flow

- Supabase user is retrieved in middleware (`src/middleware.ts:14-16`) and stored in `context.locals.user`
- `src/pages/dashboard.astro:76` passes `userEmail={user?.email}` as a prop to the React island
- `DashboardView` accepts it as `userEmail?: string` (interface at `DashboardView.tsx:30`)
- It is already available inside the component — no changes needed to data flow

### "Add portfolio" action

- **File**: `src/components/transactions/DashboardView.tsx:403-407` — `openAddPortfolio()` function
- Sets `isAddPortfolioDialogOpen(true)` and resets form state
- The Dialog itself (`isAddPortfolioDialogOpen`) already exists at lines 752-803
- The mobile modal only needs to call `openAddPortfolio()` and close itself — no duplication

### Dialog component (already imported)

- **File**: `src/components/ui/dialog.tsx` — Radix UI `Dialog` wrapper
- **Already imported** in `DashboardView.tsx:13`:
  ```ts
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
  ```
- `DialogContent` supports `showCloseButton` prop (default `true`) and renders at center with overlay
- Width: `max-w-[calc(100%-2rem)] sm:max-w-lg` — fits mobile well out of the box

### No Sheet component exists

- Only `dialog.tsx` and `alert-dialog.tsx` exist in `src/components/ui/`
- A Dialog centered on screen is the correct pattern here (same as existing modals)

## Code References

- `src/components/transactions/DashboardView.tsx:13` — Dialog import already present
- `src/components/transactions/DashboardView.tsx:23` — `User` icon already imported from lucide-react
- `src/components/transactions/DashboardView.tsx:30` — `userEmail?: string` prop definition
- `src/components/transactions/DashboardView.tsx:238` — `isAddPortfolioDialogOpen` state
- `src/components/transactions/DashboardView.tsx:452-499` — desktop-only header (all three items live here)
- `src/components/transactions/DashboardView.tsx:501-517` — mobile profile button (needs onClick)
- `src/pages/api/auth/signout.ts:1-10` — sign-out POST endpoint
- `src/components/ui/dialog.tsx:37-69` — `DialogContent` implementation

## Architecture Insights

**Self-contained change.** Everything needed already exists:

- `Dialog` + `DialogContent` + `DialogHeader` + `DialogTitle` — imported
- `User` icon — imported
- `userEmail` prop — available
- `openAddPortfolio()` — defined in same component
- `/api/auth/signout` POST endpoint — exists

The only additions are:

1. One new `useState<boolean>` for profile modal open state
2. `onClick` handler on the existing mobile button
3. A `<Dialog>` block (similar in shape to the "Add portfolio" dialog at lines 752-803)

**Styling convention.** Buttons in the header use inline styles (not Tailwind classes) matching the design tokens: `#0f1825` dark text, `#5e6e85` muted, `#dde4ee` border, `#0a86d8` primary blue. The modal body should follow the same conventions. The `Button` component (shadcn variant) is also available if preferred for the action buttons inside the modal.

**Form-based sign-out.** Sign-out uses a plain HTML form (`method="POST" action="/api/auth/signout"`) — this is intentional (no client-side fetch needed, works without JS hydration edge cases). Replicate the same form inside the mobile modal.

## Historical Context

- `context/archive/2026-06-12-modal-add-edit-transaction/` — established the Dialog pattern for in-app CRUD flows; same pattern applies here.
- `context/archive/2026-06-14-ui-max-width-and-nav-fixes/` — recent nav/header refinements; confirms the header component is `DashboardView.tsx`.

## Open Questions

None — the implementation path is clear and self-contained.

## Implementation Sketch

In `src/components/transactions/DashboardView.tsx`:

**Step 1** — Add state (near line 238, alongside other dialog states):

```tsx
const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
```

**Step 2** — Wire onClick on mobile button (line 502):

```tsx
<button
  className="flex sm:hidden"
  onClick={() => setIsProfileModalOpen(true)}
  style={
    {
      /* existing styles unchanged */
    }
  }
>
  <User size={17} />
</button>
```

**Step 3** — Add Dialog (after the existing modals, before the closing `</>`):

```tsx
<Dialog open={isProfileModalOpen} onOpenChange={setIsProfileModalOpen}>
  <DialogContent className="sm:max-w-xs">
    <DialogHeader>
      <DialogTitle>Account</DialogTitle>
    </DialogHeader>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {userEmail && (
        <span style={{ fontSize: 13, color: "#5e6e85", fontFamily: "var(--font-numeric)" }}>{userEmail}</span>
      )}
      <button
        onClick={() => {
          openAddPortfolio();
          setIsProfileModalOpen(false);
        }}
        style={
          {
            /* same style as desktop "+ Add portfolio" button */
          }
        }
      >
        + Add portfolio
      </button>
      <form method="POST" action="/api/auth/signout">
        <button
          type="submit"
          style={
            {
              /* same style as desktop sign out button, full width */
            }
          }
        >
          Sign out
        </button>
      </form>
    </div>
  </DialogContent>
</Dialog>
```
