# Sortable Portfolio Table — Plan Brief

> Full plan: `context/changes/sortable-portfolio-table/plan.md`
> Research: `context/changes/sortable-portfolio-table/research.md`

## What & Why

Add user-click column sorting to the portfolio holdings table. Seven of the ten data columns become sortable; `Ticker`, `% of net liq`, and `Price Date` remain static per spec. The default sort (`% of net liq` descending) is already the most natural view of a portfolio — this change lets users pivot to other rankings (by unrealised P&L, market value, shares, etc.) without leaving the page.

## Starting Point

The table is a plain HTML `<table>` in `src/components/transactions/DashboardView.tsx` with hardcoded headers and cells. Positions arrive from a `computePositions()` useMemo; there is no sort state, no sort icons, and no header click handlers anywhere in the component.

## Desired End State

The table opens sorted by `% of net liq` descending. Clicking any of the 7 sortable column headers sorts descending on first click; clicking again toggles to ascending. Positions with a null value in the sorted column always appear at the bottom regardless of direction. Sortable-but-inactive columns show an `ArrowUpDown` icon; the active column shows `ChevronDown` or `ChevronUp`. Non-sortable column headers are visually unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Non-sortable columns | Ticker, % of net liq, Price Date | User requirement; % of net liq is the default but not user-interactive | Plan |
| Default sort | `weightPct` descending | Largest positions first is the natural financial view | Plan |
| Null position | Always at the bottom | "Unknown" data should never jump to the top on ascending sort | Plan |
| First-click direction | Descending | Matches the default sort direction and standard financial table convention | Plan |
| Inactive column indicator | `ArrowUpDown` neutral icon | Makes sortability discoverable without requiring a hover | Plan |
| Sort location | New `sortedPositions` useMemo on top of `positions` | Keeps `computePositions` untouched; sort is a UI concern | Research |
| File scope | `DashboardView.tsx` only | No schema, API, or type changes needed | Research |

## Scope

**In scope:**
- Sort state (`sortKey`, `sortDir`) with `useState` in `DashboardView`
- `sortedPositions` useMemo with null-safe comparator
- Click handlers + `ArrowUpDown` / `ChevronUp` / `ChevronDown` icons on 7 `<th>` elements
- `<tbody>` switched from `positions.map` to `sortedPositions.map`

**Out of scope:**
- Sort persistence (localStorage, URL params)
- Sorting by Ticker (alphabetical)
- Column-config refactoring
- ARIA `aria-sort` attributes / keyboard navigation
- Any new files or API changes

## Architecture / Approach

All changes land in a single component file. The existing `positions` useMemo (which runs `computePositions`) is left untouched; a new `sortedPositions` useMemo takes `positions` as input and applies the sort. This two-memo pattern matches the one already used for `sectorSlices` and `portfolioSummary` — same deps shape, same pure-function model.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Sortable table | Sort state, null-safe comparator, 7 clickable headers with icons, tbody switch | Null comparator ordering wrong — verify with a position that has no price data |

**Prerequisites:** None — the `PortfolioPosition` type already has all the fields needed.  
**Estimated effort:** ~1 session, single file, ~30–40 lines of new code.

## Open Risks & Assumptions

- `ArrowUpDown` icon is available in Lucide React v1.14.0 (very likely — it's a core icon, but verify the import compiles).
- The sort state resets to default (`weightPct` / `desc`) whenever `transactions` or `prices` change (because `positions` is recomputed and `sortedPositions` re-derives). This is acceptable for now — sort preference is session-local and resetting on data change is safe.

## Success Criteria (Summary)

- Table loads with largest-weightPct position at row 1; `% of net liq` header has no icon.
- Clicking any sortable column sorts it correctly; nulls always sink to the bottom.
- Non-sortable headers and existing row-click-to-LotsModal behaviour are unaffected.
