# Light Theme — Implementation Plan

## Overview

Replace the app's dark "cosmic" theme with a light slate theme. The change is a class-substitution sweep across ~12 files: one CSS utility redefinition plus targeted Tailwind class replacements in every Astro page and React component that uses hardcoded dark utilities.

## Current State Analysis

The dark appearance comes from two independent layers. The CSS-variable layer (`global.css` `:root` / `.dark`) already defines a complete light palette — shadcn components reference it and are already light-mode-ready. The second layer is the actual dark theme: a `bg-cosmic` Tailwind utility (dark navy gradient) applied on every page wrapper, plus glass-morphism card patterns (`bg-white/5`, `border-white/10`, `backdrop-blur-xl`) and dark text utilities (`text-white`, `text-blue-100/*`) scattered across ~12 files. No `.dark` class is ever applied to any DOM element, so the CSS-variable dark overrides are never active.

## Desired End State

Every page renders on a light slate gradient background (`#f8fafc → #f1f5f9 → #f8fafc`). Cards are white with a light border and drop shadow. Text is dark gray. Gradient headings use `from-blue-600 via-purple-600 to-pink-600` (visible on light bg). ROI colors and error states meet contrast requirements. The Welcome page has no cosmic decorative elements.

### Verify:

1. `npx astro check` passes with zero errors
2. `npm run lint` passes
3. `npm run build` succeeds
4. Welcome page, auth pages, and dashboard all render with a light background
5. Cards/panels have visible white surfaces with border + shadow
6. Heading gradient is visible (not washed out)
7. Secondary text (`text-gray-500`) is legible
8. ROI colors (green/red) have sufficient contrast on white
9. Auth form inputs show dark text on white input bg
10. Chart legend text is dark and readable

### Key Discoveries:

- `src/styles/global.css:113-115` — `@utility bg-cosmic` defines the dark gradient; one-line replacement swaps the entire background system
- `src/styles/global.css:41-73` — `.dark { ... }` CSS variable overrides are never triggered (no code applies `class="dark"` anywhere); safe to remove
- `src/components/Welcome.astro:7-25` — three blurred orb divs and a star-field div (white radial-gradient dots) are dark-specific decorations; remove entirely
- `src/components/auth/SubmitButton.tsx` — purple CTA button (`bg-purple-600 text-white`) has adequate contrast on light bg; no change needed
- All shadcn/radix UI components (`button.tsx`, `dialog.tsx`, `alert-dialog.tsx`, `input.tsx`, `select.tsx`) use CSS-variable-based tokens and are already light-mode-ready; no changes needed

## What We're NOT Doing

- No dark/light toggle — this is a light-only replacement; `.dark` class activation logic is not added
- No changes to shadcn UI component files (`src/components/ui/*`)
- No changes to `SubmitButton.tsx` — purple CTA is fine on light bg
- No changes to `SignInForm.tsx` or `SignUpForm.tsx` — they delegate styling to `FormField`, `PasswordToggle`, `ServerError`, `SubmitButton`
- No redesign of layout structure — only color classes change
- No addition of dark-mode CSS variables or new CSS custom properties

## Implementation Approach

Two sequential phases. Phase 1 updates the global CSS utility and all Astro files — after this phase the full-page background, nav, auth cards, and Welcome page are visually correct. Phase 2 sweeps the React/TSX components — form fields, dashboard table, and the sector chart. Each phase is independently verifiable before the next begins.

**Replacement map (reference for both phases):**

| Old (dark)                                          | New (light)                                             |
| --------------------------------------------------- | ------------------------------------------------------- |
| `bg-cosmic` utility body                            | `linear-gradient(to bottom, #f8fafc, #f1f5f9, #f8fafc)` |
| `bg-white/5`                                        | `bg-white`                                              |
| `bg-white/10`                                       | `bg-white` (auth cards), `bg-gray-50` (nested surfaces) |
| `bg-white/20`                                       | `bg-gray-100`                                           |
| `bg-white/[0.03]`                                   | `bg-gray-50`                                            |
| `border-white/5`                                    | `border-gray-100`                                       |
| `border-white/10`                                   | `border-gray-200`                                       |
| `border-white/20`                                   | `border-gray-300`                                       |
| `backdrop-blur-xl` on cards                         | remove                                                  |
| `text-white`                                        | `text-gray-900`                                         |
| `text-white/80`                                     | `text-gray-700`                                         |
| `text-blue-100/40` (null ROI / expand icon)         | `text-gray-400`                                         |
| `text-blue-100/50`                                  | `text-gray-500`                                         |
| `text-blue-100/60`                                  | `text-gray-500`                                         |
| `text-blue-100/70`                                  | `text-gray-600`                                         |
| `text-blue-100/80`                                  | `text-gray-700`                                         |
| `text-purple-300 hover:text-purple-100`             | `text-purple-600 hover:text-purple-800`                 |
| gradient `from-blue-200 via-purple-200 to-pink-200` | `from-blue-600 via-purple-600 to-pink-600`              |
| gradient `from-blue-200 to-purple-200`              | `from-blue-600 to-purple-600`                           |
| `text-emerald-400`                                  | `text-emerald-600`                                      |
| `text-red-400`                                      | `text-red-600`                                          |
| `bg-red-900/30 border-red-500/30 text-red-300`      | `bg-red-50 border-red-300 text-red-700`                 |
| `bg-red-500/10 border-red-500/30 text-red-400`      | `bg-red-50 border-red-300 text-red-700`                 |
| `hover:bg-white/5`                                  | `hover:bg-gray-50`                                      |
| `hover:bg-white/10`                                 | `hover:bg-gray-100`                                     |
| `hover:bg-white/20`                                 | `hover:bg-gray-200`                                     |
| chart legend `rgba(219, 234, 254, 0.8)`             | `rgb(55, 65, 81)`                                       |

---

## Phase 1: CSS foundation + Astro files

### Overview

Redefine the `bg-cosmic` utility, remove the unused `.dark` CSS variable block, and update every Astro file that applies dark classes directly: `Welcome.astro`, `Topbar.astro`, `signin.astro`, `signup.astro`, `confirm-email.astro`.

### Changes Required:

#### 1. Redefine `bg-cosmic` and clean up `.dark` block

**File**: `src/styles/global.css`

**Intent**: Replace the dark navy gradient with a light slate gradient so the `bg-cosmic` utility becomes the light-mode background. Remove the `.dark { ... }` CSS variable block (lines 41–73) since no code applies `class="dark"` to any element and this is a light-only app.

**Contract**: The `@utility bg-cosmic` body becomes `linear-gradient(to bottom, #f8fafc, #f1f5f9, #f8fafc)`. The entire `.dark { ... }` rule block is deleted. The `@custom-variant dark` declaration on line 4 stays — it's needed by the `dark:` utility variants in the shadcn components, which compile fine even when the variant is never activated at runtime.

#### 2. Update `Welcome.astro`

**File**: `src/components/Welcome.astro`

**Intent**: Remove dark-specific decorative elements (orbs, star field) and replace all dark utility classes with light equivalents so the landing page renders cleanly on the new light background.

**Contract**:

- Delete the three orb `<div>` elements (the `pointer-events-none absolute` blurred circles with `bg-purple-500/20`, `bg-blue-500/15`, `bg-indigo-400/10`)
- Delete the star-field `<div>` (the `pointer-events-none absolute inset-0` with the `radial-gradient` inline style)
- Hero `<h1>`: `from-blue-200 via-purple-200 to-pink-200` → `from-blue-600 via-purple-600 to-pink-600`
- Hero `<p>`: `text-blue-100/70` → `text-gray-600`
- Secondary "Sign Up" `<a>`: replace `border-white/20 text-white hover:bg-white/10` → `border-gray-300 text-gray-700 hover:bg-gray-100`
- Feature cards (`<div class="rounded-xl border ..."`): replace `border-white/10 bg-white/5 backdrop-blur-xl` → `border-gray-200 bg-white shadow-sm` (remove `backdrop-blur-xl`)
- Card icon `<svg>`: `text-purple-300` → `text-purple-600`
- Card headings `<h3>`: `text-white` → `text-gray-900`
- Card body `<p>`: `text-blue-100/60` → `text-gray-500`

#### 3. Update `Topbar.astro`

**File**: `src/components/Topbar.astro`

**Intent**: Replace the dark nav bar with a light surface.

**Contract**: Root `<div>`: `border-white/10 bg-white/5 text-white/80` → `border-gray-200 bg-white text-gray-700` (remove `backdrop-blur-xl` if present). `text-blue-100/70` (email / "Not signed in") → `text-gray-500`. All `text-purple-300 hover:text-purple-100` links → `text-purple-600 hover:text-purple-800`.

#### 4. Update `signin.astro`

**File**: `src/pages/auth/signin.astro`

**Intent**: Replace the dark auth card with a light card on the now-light background.

**Contract**: Card `<div>`: `border-white/10 bg-white/10 text-white backdrop-blur-xl` → `border-gray-200 bg-white text-gray-900 shadow-md` (remove `backdrop-blur-xl`). `<h1>` gradient: `from-blue-200 to-purple-200` → `from-blue-600 to-purple-600`. Footer `<p>`: `text-blue-100/60` → `text-gray-500`. Footer link: `text-purple-300` → `text-purple-600`.

#### 5. Update `signup.astro`

**File**: `src/pages/auth/signup.astro`

**Intent**: Same card-to-light-card swap as `signin.astro`.

**Contract**: Identical substitutions: card `border-white/10 bg-white/10 text-white backdrop-blur-xl` → `border-gray-200 bg-white text-gray-900 shadow-md`. `<h1>` gradient → `from-blue-600 to-purple-600`. Footer `text-blue-100/60` → `text-gray-500`. Footer link `text-purple-300` → `text-purple-600`.

#### 6. Update `confirm-email.astro`

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: Same light-card swap for the confirmation screen.

**Contract**: Card `<div>`: `border-white/10 bg-white/10 text-white backdrop-blur-xl` → `border-gray-200 bg-white text-gray-900 shadow-md` (remove `backdrop-blur-xl`). `<h1>` gradient: `from-blue-200 to-purple-200` → `from-blue-600 to-purple-600`. Description `<p>`: `text-blue-100/80` → `text-gray-600`. Back link: `text-purple-300` → `text-purple-600`.

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes with zero errors
- `npm run lint` passes

#### Manual Verification:

- Welcome page renders with light slate gradient background (no dark navy)
- Orbs and star field are gone from the Welcome page
- Heading gradient is visible and dark blue-to-pink
- Auth pages (signin, signup, confirm-email) show a white card on the light bg
- Topbar appears as a white nav bar with dark text and purple links

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 2.

---

## Phase 2: React/TSX component sweep

### Overview

Replace dark utility classes in the five React/TSX components: `FormField.tsx`, `PasswordToggle.tsx`, `ServerError.tsx`, `DashboardView.tsx`, and `SectorAllocationChart.tsx`.

### Changes Required:

#### 1. Update `FormField.tsx`

**File**: `src/components/auth/FormField.tsx`

**Intent**: Replace all dark input and label colors so form fields render correctly on the light auth card.

**Contract**: `inputBase` constant — replace `bg-white/10 text-white placeholder-white/40` with `bg-white text-gray-900 placeholder-gray-400`. Label: `text-blue-100/80` → `text-gray-700`. Icon span: `text-white/40` → `text-gray-400`. Error border/ring: `border-red-400/60 focus:ring-red-400` → `border-red-500 focus:ring-red-500`. Normal border/ring: `border-white/20 focus:ring-purple-400` → `border-gray-300 focus:ring-purple-500`. Error message `<p>`: `text-red-300` → `text-red-600`.

#### 2. Update `PasswordToggle.tsx`

**File**: `src/components/auth/PasswordToggle.tsx`

**Intent**: Replace the white-opacity toggle icon colors with gray equivalents.

**Contract**: Toggle `<button>`: `text-white/40 hover:text-white/70` → `text-gray-400 hover:text-gray-600`.

#### 3. Update `ServerError.tsx`

**File**: `src/components/auth/ServerError.tsx`

**Intent**: Replace the dark error banner (dark red bg, muted red border) with a light-mode error surface.

**Contract**: Error `<p>`: `border-red-500/30 bg-red-900/30 text-red-300` → `border-red-300 bg-red-50 text-red-700`.

#### 4. Update `DashboardView.tsx`

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Replace all dark utility classes in the dashboard: root wrapper, toolbar, table container, table rows, sub-table, sector chart card, and error banner. Also darken ROI semantic colors for contrast.

**Contract** (by section):

- Root `<div>`: `bg-cosmic min-h-screen p-6 text-white` → `bg-cosmic min-h-screen p-6 text-gray-900`
- Portfolio heading `<h1>` gradient: `from-blue-200 to-purple-200` → `from-blue-600 to-purple-600`
- User email `<span>`: `text-blue-100/60` → `text-gray-500`
- Sign-out `<button>`: `border-white/20 bg-white/10 text-white hover:bg-white/20` → `border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200`
- Empty-state `<div>`: `border-white/10 bg-white/5` → `border-gray-200 bg-white`; text `text-blue-100/60` → `text-gray-500`
- Table container `<div>`: `border-white/10 bg-white/5` → `border-gray-200 bg-white shadow-sm` (remove `backdrop-blur-xl`)
- Table header `<tr>`: `border-white/10 text-blue-100/60` → `border-gray-200 text-gray-500`
- Data rows `<tr>`: `border-white/5 hover:bg-white/5` → `border-gray-100 hover:bg-gray-50`
- Expand icon `<td>`: `text-blue-100/40` → `text-gray-400`
- Sub-table wrapper `<td>`: `bg-white/[0.03]` → `bg-gray-50`
- Sub-table header row: `text-blue-100/40` → `text-gray-400`
- `roiClass` function: null branch `text-blue-100/40` → `text-gray-400`; positive `text-emerald-400` → `text-emerald-600`; negative `text-red-400` → `text-red-600`
- Delete button: `text-red-400 hover:text-red-400` → `text-red-600 hover:text-red-600`
- Sector chart card `<div>`: `border-white/10 bg-white/5` → `border-gray-200 bg-white shadow-sm` (remove `backdrop-blur-xl`); heading `text-blue-100/80` → `text-gray-700`
- Delete error `<p>`: `border-red-500/30 bg-red-500/10 text-red-400` → `border-red-300 bg-red-50 text-red-700`

#### 5. Update `SectorAllocationChart.tsx`

**File**: `src/components/portfolio/SectorAllocationChart.tsx`

**Intent**: Replace dark empty-state colors and the hardcoded light-blue chart legend color.

**Contract**: Empty-state `<div>`: `border-white/10` → `border-gray-200`; text `text-blue-100/60` → `text-gray-500`. Chart `options.plugins.legend.labels.color`: `"rgba(219, 234, 254, 0.8)"` → `"rgb(55, 65, 81)"`.

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes with zero errors
- `npm run lint` passes
- `npm run build` succeeds

#### Manual Verification:

- Dashboard table renders with white background, gray borders, dark text
- Positive ROI shows in `text-emerald-600`; negative in `text-red-600`
- Auth form fields show dark text on white input bg; placeholder text is visible
- Password toggle icon is visible (gray on white)
- Form validation errors render in red on white
- Server errors (auth failures) show `bg-red-50` banner with dark red text
- Sector chart legend text is dark and readable on the white chart card
- Empty portfolio chart area shows "No positions to display" with `text-gray-500`
- Adding/deleting a transaction: no dark artifacts visible in the delete confirmation dialog

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before marking the phase complete.

---

## Testing Strategy

### Manual Testing Steps:

1. Open the Welcome page — verify light background, no orbs/stars, visible gradient heading
2. Sign in → dashboard → verify table, toolbar, sector chart all render in light colors
3. Expand a ticker row → verify sub-table rows have light gray background
4. Open "Add transaction" modal → verify form fields have dark text on white bg
5. Trigger a validation error in the form → verify red error text is readable
6. Simulate a server error (e.g., wrong password) → verify `bg-red-50` error banner
7. Hover over a table row → verify `hover:bg-gray-50` subtle highlight
8. Check the Sector Allocation chart legend text is dark

## References

- Research: `context/changes/light-theme/research.md`
- CSS definition: `src/styles/global.css:113-115`
- Dark class inventory: research §"Component Dark-Color Inventory"
- Welcome.astro decorative elements: `src/components/Welcome.astro:7-25`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: CSS foundation + Astro files

#### Automated

- [x] 1.1 `npx astro check` passes with zero errors — 9116731
- [x] 1.2 `npm run lint` passes — 9116731

#### Manual

- [x] 1.3 Welcome page renders with light background, no orbs or star field — 9116731
- [x] 1.4 Heading gradient visible (dark blue-to-pink on light bg) — 9116731
- [x] 1.5 Auth pages show white card on light background — 9116731
- [x] 1.6 Topbar appears as white nav bar with dark text and purple links — 9116731

### Phase 2: React/TSX component sweep

#### Automated

- [x] 2.1 `npx astro check` passes with zero errors — a1cf9b1
- [x] 2.2 `npm run lint` passes — a1cf9b1
- [x] 2.3 `npm run build` succeeds — a1cf9b1

#### Manual

- [x] 2.4 Dashboard table renders with white bg, gray borders, dark text — a1cf9b1
- [x] 2.5 ROI colors visible with adequate contrast (`text-emerald-600` / `text-red-600`) — a1cf9b1
- [x] 2.6 Auth form fields show dark text on white input bg — a1cf9b1
- [x] 2.7 Form validation errors and server error banners render in light-mode red — a1cf9b1
- [x] 2.8 Sector chart legend text is dark and readable — a1cf9b1
- [x] 2.9 No dark artifacts visible in dialogs or on hover — a1cf9b1
