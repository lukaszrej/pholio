# Light Theme — Plan Brief

> Full plan: `context/changes/light-theme/plan.md`
> Research: `context/changes/light-theme/research.md`

## What & Why

Replace the app's dark "cosmic" navy theme with a clean light slate theme. The user's intent is a light-only redesign — no toggle, no dark mode preserved. The motivation is purely visual: the current dark-first aesthetic doesn't suit the desired direction.

## Starting Point

The dark appearance is produced entirely by hardcoded Tailwind utilities (`bg-cosmic`, `bg-white/5`, `border-white/10`, `text-white`, `text-blue-100/*`) scattered across ~12 files. The CSS-variable system (`global.css` `:root` / `.dark`) already defines a full light palette, and all shadcn UI components already render in light mode — they need no changes.

## Desired End State

Every page renders on a light slate gradient background. Cards are white with a light gray border and drop shadow. Text is dark gray. Gradient headings are `from-blue-600 to-purple-600` (visible on white). ROI indicators and error states use darker variants for contrast. The Welcome page has no cosmic decorative elements.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Scope | Light-only replacement | User explicitly said "change it to light" — no toggle | User |
| Gradient headings | Darken to `from-blue-600 via-purple-600 to-pink-600` | `from-blue-200` washes out on white bg | User ("darken it") |
| Page background | Subtle slate gradient `#f8fafc → #f1f5f9 → #f8fafc` | Retains structural depth without being stark white | Plan |
| Card style | White + `border-gray-200 shadow-sm` | Standard light-mode elevated card; clean and readable | Plan |
| Welcome decorations | Remove orbs + star field entirely | White-dot radial gradients and blur blobs don't work on light bg | Plan |
| shadcn components | No changes | Already CSS-variable-aware and rendering light | Research |
| ROI colors | Darken to `-600` variants | `emerald-400` / `red-400` have poor contrast on white | Plan |

## Scope

**In scope:**
- `src/styles/global.css` — redefine `bg-cosmic`, remove `.dark` block
- `src/components/Welcome.astro` — remove decorative elements, update dark classes
- `src/components/Topbar.astro` — update dark classes
- `src/pages/auth/signin.astro`, `signup.astro`, `confirm-email.astro` — update auth card
- `src/components/auth/FormField.tsx`, `PasswordToggle.tsx`, `ServerError.tsx` — form colors
- `src/components/transactions/DashboardView.tsx` — dashboard table, toolbar, sector card
- `src/components/portfolio/SectorAllocationChart.tsx` — empty state + legend color

**Out of scope:**
- `src/components/ui/*` (shadcn) — already light-mode ready
- `src/components/auth/SubmitButton.tsx` — purple CTA is fine on light bg
- Dark/light toggle mechanism
- Any layout structure changes

## Architecture / Approach

Single-source dark theme: the `bg-cosmic` utility in `global.css` covers the full-page background; all other dark classes are applied inline in each file's JSX/Astro template. The approach is a mechanical class-substitution sweep in two phases — no new abstractions introduced. Every `bg-white/*` becomes a solid gray/white, every `border-white/*` becomes a gray border, every `text-blue-100/*` becomes a gray text shade.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. CSS + Astro files | Light bg active, auth pages and Welcome visually correct | Removing star-field's inline style correctly (it's in a `style=""` attribute, not a class) |
| 2. React/TSX sweep | Dashboard, auth forms, sector chart all light | DashboardView has the most class occurrences — easy to miss one |

**Prerequisites:** Phase 1 must complete before Phase 2 (background must be correct to judge component contrast).  
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- The `AddTransactionForm.tsx` error states (`text-red-400`) are already red, not dark-red. They'll have slightly less contrast on light bg — Phase 2 updates `DashboardView`'s error banner; `AddTransactionForm`'s inline field errors already use `text-red-400` which is acceptable on white (may darken to `-600` if contrast review warrants it).
- `SubmitButton.tsx` spinner uses `border-white/30 border-t-white` inside a purple button — this is fine since the spinner renders against purple, not white bg.

## Success Criteria (Summary)

- All pages render with light slate background and white cards
- No dark navy, white-opacity borders, or light-on-dark text remains anywhere in the UI
- `npx astro check`, `npm run lint`, and `npm run build` all pass
