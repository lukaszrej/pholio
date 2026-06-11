# Sector Allocation Chart — Plan Brief

> Full plan: `context/changes/sector-allocation-chart/plan.md`

## What & Why

S-05: add a donut chart showing each sector's percentage share of the user's portfolio by current market value. Sector classification comes from Finnhub's company profile endpoint (`finnhubIndustry`). This is a PRD nice-to-have that closes the last item in the Pholio MVP roadmap.

## Starting Point

The Finnhub integration (`src/lib/finnhub.ts`, `fetchQuote`) and the `prices` Supabase cache table are fully operational from S-03. No sector data exists anywhere in the schema — no DB column, no table, and no charting library is installed.

## Desired End State

A donut chart renders above the portfolio table on every page load. Each colored slice is a sector (e.g., "Technology", "Healthcare") sized by current market value. Tickers without Finnhub sector coverage are grouped into a gray "Other" slice. The chart reacts to transaction adds/edits/deletes in real time via the existing `useMemo` chain. When the portfolio is empty, a card with an empty-state message appears in place of the chart.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Chart type | Donut | Matches how sector allocation is displayed in comparable tools; center space can show totals | Plan |
| Chart placement | Above table, full-width card | Immediately visible on page load — matches PRD success criterion of "widzi wykres" | Plan |
| Charting library | Chart.js + react-chartjs-2 | User preference | Plan |
| Sector data caching | New `sectors` Supabase table, 7-day TTL | Mirrors the `prices` pattern; sectors are stable — daily refresh wastes Finnhub quota | Plan |
| Allocation metric | Current market value (position value) | Most meaningful — tells the user where their money actually sits | Plan |
| Unknown sector | Bucket into "Other" gray slice | Chart always sums to 100%; never hides exposure | Plan |
| Empty state | Subtle card with CTA | Consistent with existing table empty state | Plan |

## Scope

**In scope:**
- New `sectors` Supabase table with RLS
- `fetchSector(ticker)` function in `src/lib/finnhub.ts`
- Sector data fetching and caching in `dashboard.astro`
- `SectorSlice` type and `computeSectorAllocation()` in `src/lib/portfolio.ts`
- `SectorAllocationChart` React component (Chart.js Doughnut)
- `DashboardView` updated to show chart above the table

**Out of scope:**
- Sector column in `transactions` table
- GICS sector mapping or sub-industry granularity
- Chart legend click to filter the table
- Currency conversion before value summation
- Positions with null `positionValue` (excluded from allocation)

## Architecture / Approach

New sector data flows server-side (parallel to the existing price fetch in `dashboard.astro`) into the existing React island. `computeSectorAllocation()` is a pure function in `portfolio.ts` that sits alongside `computePositions()`. The chart component is a standalone React component using Chart.js, registered at module scope. The allocation `useMemo` depends on `positions` — so every optimistic transaction mutation already propagates to the chart automatically.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. DB migration | `sectors` Supabase table with RLS | Must mirror `prices` policy structure exactly |
| 2. Finnhub wiring | Sector data fetched and cached server-side; passed to DashboardView | Finnhub `finnhubIndustry` field may be empty for some tickers — null return must not be cached |
| 3. Chart + DashboardView | Donut chart renders above table; real-time updates via useMemo | Chart.js canvas height must be explicitly set; Chart.register must be at module scope |

**Prerequisites:** All of S-03 (`portfolio-roi-view`) must be deployed — the `prices` table and `fetchQuote` are required foundations.  
**Estimated effort:** ~2 sessions across 3 phases

## Open Risks & Assumptions

- Chart.js + react-chartjs-2 chosen by user preference over the Recharts recommendation — SSR risk is mitigated because DashboardView is already a React island, but the canvas height constraint (Critical Implementation Details in the plan) must be followed
- Finnhub `finnhubIndustry` classification varies in granularity; some lesser-known tickers may consistently return empty — those will always appear as "Other"
- Mixed-currency portfolios: position values are summed without FX conversion (same limitation as the existing ROI display); the allocation is approximate for multi-currency portfolios

## Success Criteria (Summary)

- Donut chart appears above the portfolio table with sector slices proportional to market value
- Chart updates immediately when a transaction is added or deleted (no page reload)
- Sector percentages sum to 100% of the priced portfolio value; "Other" accounts for unclassified tickers
