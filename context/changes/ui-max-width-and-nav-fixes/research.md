---
date: 2026-06-14T00:00:00+00:00
researcher: Claude Sonnet 4.6
git_commit: 2d1256967bbfd753961ce769b4767fe562bd91ae
branch: main
repository: Pholio
topic: "UI max-width constraint, portfolio table width, and nav tab label centering"
tags: [research, codebase, layout, DashboardView, PortfolioSection, NavTabs, global.css]
status: complete
last_updated: 2026-06-14
last_updated_by: Claude Sonnet 4.6
---

# Research: UI max-width, portfolio table width, and nav tab centering

**Date**: 2026-06-14  
**Researcher**: Claude Sonnet 4.6  
**Git Commit**: 2d1256967bbfd753961ce769b4767fe562bd91ae  
**Branch**: main  
**Repository**: Pholio

## Research Question

Three visual fixes for the Pholio dashboard:

1. Reduce app max-width so it's not full-width on wide screens — restore previous layout where only TickerTape spans the full width.
2. On the individual portfolio tab, the holdings table should fill all available horizontal space on wider screens.
3. Nav tab labels are not centered relative to their underline indicator — restore the original centered design.

## Summary

All three issues trace to regressions introduced in commit `f728841` ("feat: implement Terminal-Light responsive design from design system spec", 2026-06-14). That commit rewrote `DashboardView.tsx` from Tailwind classes to inline styles and removed the `max-w-6xl` centered wrapper that previously existed. The portfolio table issue is a pre-existing CSS bug (`display: table` on a wrapper div defeats `width: 100%` on its child). The nav tab issue is a missing `justifyContent: "center"` in the tab button style function.

Each fix is a small, surgical change to one or two files:

| Issue             | File                                            | Change                                                                          |
| ----------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| App max-width     | `src/components/transactions/DashboardView.tsx` | Wrap header + nav + content in centered max-width div; TickerTape stays outside |
| Portfolio table   | `src/styles/global.css`                         | Change `.holdings-table` from `display: table` to `display: block` on md+       |
| Nav tab centering | `src/components/transactions/DashboardView.tsx` | Add `justifyContent: "center"` to `tabBtnStyle`                                 |

---

## Detailed Findings

### Issue 1: App max-width — entire dashboard is full-width

**File**: `src/components/transactions/DashboardView.tsx`

The root container at **line 412** is a bare full-width div with no inner centered wrapper:

```tsx
<div style={{ background: "#eef1f6", minHeight: "100vh" }}>
  {/* TickerTape — lines 33-72 component, rendered first */}
  {/* Header — lines 417-514 */}
  {/* NavTabs — lines 517-524 */}
  {/* Main Content — line 527 */}
</div>
```

**Historical context**: A max-width wrapper was live in commit `9d49654` (2026-06-13):

```tsx
<div className="bg-cosmic min-h-screen text-gray-900">
  <div className="mx-auto max-w-6xl px-6 py-6">
    {" "}
    ← was present here
    {/* content */}
  </div>
</div>
```

This was removed in `f728841` when the Terminal-Light inline-style rewrite landed. The archived plan (`context/archive/2026-06-13-app-max-width/`) originally specified `max-w-7xl` (1280 px); the implementation used `max-w-6xl` (1024 px).

**TickerTape component** (lines 33-72 in DashboardView.tsx) uses:

```tsx
<div style={{
  display: "flex", alignItems: "center",
  height: 34, padding: "0 22px",
  borderBottom: "1px solid #dde4ee",
  overflow: "hidden", whiteSpace: "nowrap",
  background: "#fff",
  boxShadow: "0 1px 0 rgba(15,24,37,.03)",
}}>
```

It has no width constraint of its own — it relies on its parent being full-width. It **must remain outside the centered wrapper** to stay full-bleed.

**Current widths of all sections** (all 100%):

- Body: `width: 100%` via `Layout.astro:47`
- Root div: implicit 100%
- TickerTape: `padding: 0 22px`, no max-width
- Header: `padding: 18px 22px 0`, no max-width
- Nav Tabs: `padding: 0 22px`, no max-width
- Main Content: `padding: 22px`, no max-width

**Fix**: Inside the root div, after TickerTape, add a `style={{ maxWidth: "...", margin: "0 auto", width: "100%" }}` wrapper around header + nav + content. The exact max-width should restore what the user remembers — the archived plan used 1280 px (`max-w-7xl` equivalent).

---

### Issue 2: Portfolio holdings table doesn't fill horizontal space

**File**: `src/styles/global.css` (lines 169-175)  
**File**: `src/components/portfolio/PortfolioSection.tsx` (lines 461-754)

The `.portfolio-content` grid is correct:

```css
/* global.css:155-167 */
.portfolio-content {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--tl-line);
}
@media (min-width: 768px) {
  .portfolio-content {
    display: grid;
    grid-template-columns: 1fr 320px;   ← holdings gets 1fr
  }
}
```

The holdings panel structure inside `PortfolioSection.tsx:468-471`:

```tsx
<div className="portfolio-content">
  {/* Holdings panel */}
  <div style={{ background: "#fff", border: "1px solid #dde4ee", overflow: "hidden" }}>
    {/* Desktop table — shown on md+ */}
    <div className="holdings-table" style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>{/* 9 columns */}</table>
    </div>
    {/* Mobile list — hidden on md+ */}
    <div className="holdings-list">...</div>
  </div>
  {/* 320px sidebar */}
  <div style={{ background: "#fff", border: "1px solid #dde4ee", padding: "16px 18px" }}>{/* Sector Allocation */}</div>
</div>
```

The root cause is in `global.css:169-175`:

```css
.holdings-table {
  display: none;
}
.holdings-list {
  display: block;
}
@media (min-width: 768px) {
  .holdings-table {
    display: table;
  }
  ← BUG HERE .holdings-list {
    display: none;
  }
}
```

`display: table` on a `<div>` makes it behave like a `<table>` element — it **shrinks to fit its content** rather than stretching to fill the grid column. The `<table>` inside has `width: 100%`, but that 100% is relative to the `.holdings-table` div's content-sized width, not the full `1fr` column.

**Fix**: Change `display: table` to `display: block` in the `@media (min-width: 768px)` block. `display: block` makes `.holdings-table` fill the full `1fr` column, and the child `<table width="100%">` then naturally fills it.

---

### Issue 3: Nav tab labels not centered with underline

**File**: `src/components/transactions/DashboardView.tsx`

`tabBtnStyle` function (lines 82-101):

```typescript
function tabBtnStyle(isActive: boolean): React.CSSProperties {
  return {
    appearance: "none",
    background: "none",
    border: 0,
    color: isActive ? "#0f1825" : "#5e6e85",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    fontWeight: 500,
    padding: "11px 16px", // 16px horizontal padding each side
    letterSpacing: ".01em",
    display: "inline-flex",
    gap: 8,
    alignItems: "center", // vertical centering only
    // ← justifyContent: "center" is MISSING
    whiteSpace: "nowrap",
    transition: "color .22s",
    flexShrink: 0,
  };
}
```

The underline ("ink") calculation (lines 103-113):

```typescript
const updateInk = useCallback(() => {
  const nav = navRef.current;
  if (!nav) return;
  const activeBtn = nav.querySelector<HTMLButtonElement>('[data-active="true"]');
  if (!activeBtn) return;
  setInkStyle({ width: activeBtn.offsetWidth, x: activeBtn.offsetLeft }); // full button box
}, []);
```

The underline span (lines 195-208):

```tsx
<span
  style={{
    position: "absolute",
    bottom: -1,
    height: 2,
    background: "#0a86d8",
    borderRadius: 2,
    boxShadow: "0 0 10px rgba(10,134,216,.7)",
    width: inkStyle.width, // = full button offsetWidth (including padding)
    transform: `translateX(${inkStyle.x}px)`, // = full button offsetLeft
    transition: "transform .34s cubic-bezier(.65,0,.35,1), width .34s cubic-bezier(.65,0,.35,1)",
    pointerEvents: "none",
  }}
/>
```

The underline correctly spans the full button width and aligns to the button's left edge. The problem is that without `justifyContent: "center"`, the button's flex content (text + optional badge) is **left-aligned** within the button's padding box. On tabs without badges ("All Portfolios"), the label sits left of center. On tabs with a badge, label and badge together float left.

The underline center = button center = `offsetLeft + offsetWidth/2`.  
The text center = `offsetLeft + paddingLeft + textWidth/2` ≠ button center.

**Fix**: Add `justifyContent: "center"` to `tabBtnStyle`. This centers the flex row (text + gap + badge) within the button's padding box, so the visual center of the content matches the underline's center. The `offsetWidth`/`offsetLeft` calculation does not need to change.

**Git history**: The `NavTabs` component was introduced in commit `f728841` (2026-06-14). The `tabBtnStyle` was written without `justifyContent` from the start — this is not a regression from a later edit.

---

## Code References

- `src/components/transactions/DashboardView.tsx:412` — Root container, full-width div, no max-width wrapper
- `src/components/transactions/DashboardView.tsx:33-72` — TickerTape component definition (must stay full-width)
- `src/components/transactions/DashboardView.tsx:82-101` — `tabBtnStyle` function, missing `justifyContent: "center"`
- `src/components/transactions/DashboardView.tsx:112` — Underline ink calculation (`offsetWidth`, `offsetLeft`)
- `src/components/transactions/DashboardView.tsx:195-208` — Underline span renderer
- `src/styles/global.css:155-167` — `.portfolio-content` grid definition (correct)
- `src/styles/global.css:169-175` — `.holdings-table` / `.holdings-list` toggle — `display: table` bug
- `src/components/portfolio/PortfolioSection.tsx:468-471` — Holdings panel and table structure

## Architecture Insights

- The app uses **Astro + React islands** — `Layout.astro` is a shell, `DashboardView.tsx` is the React root for the dashboard.
- Styling is split between **global CSS** (`src/styles/global.css`, Tailwind v4 via `@tailwindcss/vite`) and **React inline styles** in `DashboardView.tsx` and `PortfolioSection.tsx`. The Terminal-Light rewrite (commit `f728841`) moved aggressively toward inline styles.
- **No Tailwind config file** (`tailwind.config.ts` does not exist) — Tailwind v4 uses CSS-first config via `@theme` in `global.css`.
- The nav underline is a JS-driven "ink bar" technique (`offsetWidth` / `offsetLeft` on the active button, driven by a `ResizeObserver` + click handler). It is correct in principle; the only missing piece is content centering.

## Historical Context (from prior changes)

- `context/archive/2026-06-13-app-max-width/` — A prior change that implemented `max-w-6xl` centering (commit `9d49654`). Was archived on 2026-06-13 but the implementation was overwritten by the Terminal-Light rewrite in `f728841` the next day. The archived plan originally targeted `max-w-7xl` (1280 px).

## Open Questions

1. **Max-width value**: The archived change used `max-w-6xl` (1024 px); the archived plan called for `max-w-7xl` (1280 px). Which should the plan target? Need user confirmation.
2. **Horizontal padding inside the max-width wrapper**: The current sections use `22px` padding. Should the wrapper absorb this as its own padding, or should each section keep its own?
3. **TickerTape spacing**: The user says "only TickerTape should be without additional spacing" — does this mean the max-width container should have no horizontal padding (spacing is already handled inside each section), or should the container provide the spacing?
