# Sector Allocation Chart — Implementation Plan

## Overview

Implement S-05: a donut chart showing each sector's percentage of the user's portfolio by current market value. Sector classification comes from Finnhub's company profile endpoint (`finnhubIndustry`), cached in a new `sectors` Supabase table with a 7-day TTL. The chart renders above the existing portfolio table in a full-width card. Chart.js + react-chartjs-2 is the charting library.

## Current State Analysis

- `src/lib/finnhub.ts` has `fetchQuote(ticker)` using the Finnhub quote endpoint — `fetchSector` follows the same pattern calling `/api/v1/stock/profile2`
- `src/pages/dashboard.astro` fetches prices via `Promise.allSettled` with a p-limit rate cap, passes `initialTransactions` + `initialPrices` + `userEmail` to `DashboardView`
- `src/lib/portfolio.ts` has `PriceData`, `PortfolioPosition`, and `computePositions` — the new `SectorSlice` type and `computeSectorAllocation` go here
- `src/components/transactions/DashboardView.tsx` Props: `{ initialTransactions, initialPrices, userEmail }` — needs `initialSectors` added
- No sector data exists anywhere in the schema: no column in `transactions`, no `sectors` table, no sector field in `prices`
- No charting library in `package.json`; `chart.js` and `react-chartjs-2` must be installed

## Desired End State

Logged-in user with at least one priced position opens the dashboard and sees a donut chart above the portfolio table. Each colored slice represents a sector (e.g., "Technology", "Healthcare"); hovering shows the sector name, percentage, and total market value. Tickers with no Finnhub sector data are grouped into a gray "Other" slice. If the portfolio has no positions (or all positions have null prices), the chart area shows an empty-state card matching the table's existing empty state.

### Verify:
1. `npx astro check` passes with zero errors
2. `npm run lint` passes
3. `npm run build` succeeds
4. Logged-in user with ≥ 1 priced position sees a donut chart above the portfolio table
5. Sector percentages sum to 100% (or the chart is empty when no positions exist)
6. Positions with no Finnhub sector coverage appear as an "Other" gray slice
7. Adding a transaction updates the chart allocation without page reload (same optimistic-update path as the table)
8. Supabase `sectors` table shows one row per unique ticker after first page load; second load within 7 days does not update `fetched_at`

### Key Discoveries:

- Finnhub `/api/v1/stock/profile2` returns `{ finnhubIndustry: string, ... }` — the sector field; same API key as `fetchQuote`; same error-handling pattern applies
- `DashboardView` is already a React island (uses `useState`, `useMemo`) — Chart.js canvas rendering works inside it without dynamic import or `ssr: false` workarounds
- Chart.js requires explicit parent height for the Doughnut canvas to render at a predictable size (non-obvious with react-chartjs-2's default 100% height behavior)
- Chart.js global registration (`Chart.register(...)`) must happen at module level outside the component function — calling it inside the component causes repeated re-registration warnings

## What We're NOT Doing

- No sector data column in the `transactions` table — sectors are market reference data cached globally, not per-user
- No granular industry sub-classification — `finnhubIndustry` is used as-is; no GICS mapping layer
- No chart for positions with null `positionValue` (missing price) — they don't count toward the allocation
- No color picker or user-defined sector colors — fixed palette assigned cyclically
- No chart legend click to filter the portfolio table — S-05 scope ends at the chart itself
- No currency conversion before summing position values — mixed-currency portfolios sum values as-is, consistent with the existing table's ROI skipping (`roiAbs: null` for multi-currency tickers)

## Implementation Approach

Three sequential phases. Phase 1 is the DB migration (prerequisite for caching). Phase 2 wires the Finnhub company profile endpoint and passes sector data to the frontend without changing the UI. Phase 3 delivers the allocation logic and chart. Each phase is independently verifiable before the next begins.

Data flow after this change:
```
dashboard.astro (server):
  1. fetch transactions (existing)
  2. extract unique tickers (existing)
  3. fetch prices (existing)
  4. fetch sectors → read sectors table → fetchSector() for missing/stale entries → upsert
  5. pass initialTransactions + initialPrices + initialSectors to DashboardView

DashboardView (client):
  positions = useMemo(() => computePositions(transactions, prices), [transactions, prices])
  sectorSlices = useMemo(() => computeSectorAllocation(positions, sectors), [positions, sectors])
  renders SectorAllocationChart above portfolio table
```

## Critical Implementation Details

**Chart.js Doughnut canvas height** — react-chartjs-2's `<Doughnut>` defaults to filling its parent's height. Wrap the component in a `<div style={{ position: "relative", height: "300px" }}>` (or equivalent Tailwind `h-[300px] relative`) to give the canvas a concrete height; without it the chart may render collapsed or overflow.

**Chart.js registration** — call `Chart.register(ArcElement, Tooltip, Legend)` at the top of `SectorAllocationChart.tsx` module scope (outside the component function). Importing `DoughnutController` separately is not required — `Doughnut` from react-chartjs-2 handles controller registration internally when the above three are registered.

---

## Phase 1: DB migration — `sectors` cache table

### Overview

Create the `sectors` Supabase table that caches ticker-to-sector mappings. Like `prices`, this is a global shared table — sector data is market reference data, not per-user. RLS permits any authenticated user to read and upsert.

### Changes Required:

#### 1. Create sectors migration

**File**: `supabase/migrations/20260610000000_create_sectors.sql` *(new file)*

**Intent**: Define the `sectors` table and its RLS policies, mirroring the structure of the `prices` migration.

**Contract**: The migration must:
- Create `public.sectors` with columns: `ticker TEXT PRIMARY KEY`, `sector TEXT NOT NULL`, `fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY`
- Add three policies: SELECT, INSERT, UPDATE — each using `auth.role() = 'authenticated'`; follow the exact same policy structure as `20260609000000_create_prices.sql`

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db push` completes without errors (or SQL pasted in Supabase Dashboard SQL Editor)
- `npx astro check` passes
- `npm run lint` passes

#### Manual Verification:

- `sectors` table visible in Supabase Dashboard → Table Editor with columns: `ticker`, `sector`, `fetched_at`
- RLS is enabled on the table

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 2: Finnhub sector client + dashboard.astro wiring

### Overview

Add `fetchSector(ticker)` to the existing Finnhub client and update `dashboard.astro` to fetch and cache sector data using a 7-day TTL. The dashboard now passes `initialSectors` to `DashboardView`. No visible UI change yet.

### Changes Required:

#### 1. Add `fetchSector` to the Finnhub client

**File**: `src/lib/finnhub.ts`

**Intent**: Expose a `fetchSector(ticker)` function that calls the Finnhub company profile endpoint and returns the sector string. Follows the identical failure-safe pattern as `fetchQuote`: missing key, timeout, non-200, or empty `finnhubIndustry` all return null — callers treat null as "unknown" and the chart buckets it into "Other".

**Contract**: Export `fetchSector(ticker: string): Promise<string | null>`:
- Same `FINNHUB_API_KEY` guard and 2.5s AbortController timeout as `fetchQuote`
- Endpoint: `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_API_KEY}`
- If `!response.ok` → return `null`
- If `data.finnhubIndustry` is a non-empty string → return it; otherwise return `null`
- Wrap in try/catch; catch → return `null`; finally → `clearTimeout(timeout)`

#### 2. Update `dashboard.astro` — sector fetching

**File**: `src/pages/dashboard.astro`

**Intent**: After the existing price-fetch block, fetch and cache sector data for all unique tickers. Uses a 7-day TTL. Assembles `sectors: Record<string, string>` and passes it to `DashboardView`.

**Contract**: New frontmatter block after the prices block:
1. If `supabase && uniqueTickers.length > 0`: query `supabase.from("sectors").select("*").in("ticker", uniqueTickers)` — build a `Map<string, { sector, fetched_at }>` from result
2. Initialise `sectors: Record<string, string> = {}`
3. 7-day staleness constant: `7 * 24 * 60 * 60 * 1000` ms
4. `await Promise.allSettled(uniqueTickers.map(async (ticker) => { ... }))` — for each ticker:
   - If cached row exists and age < 7 days → write `sectors[ticker] = cached.sector`; return (skip Finnhub)
   - Otherwise: call `fetchSector(ticker)` from `@/lib/finnhub`
   - If non-null → `await supabase.from("sectors").upsert({ ticker, sector: result, fetched_at: new Date().toISOString() })`; write `sectors[ticker] = result`
   - If null → leave `sectors[ticker]` absent (the chart's `computeSectorAllocation` will fall back to "Other"; don't cache nulls so we retry next week)
5. Pass `initialSectors={sectors}` as a new prop on `<DashboardView>` — the component will type-error until Phase 3 updates its Props interface; acceptable at this phase boundary

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes (may show one expected type error on `DashboardView` prop until Phase 3 — acceptable)
- `npm run lint` passes

#### Manual Verification:

- After page load with real transactions and a valid `FINNHUB_API_KEY`: Supabase Dashboard → `sectors` table shows rows with `ticker`, `sector`, `fetched_at`
- A second page load within 7 days: `fetched_at` timestamps in `sectors` do not change (7-day cache hit)
- A ticker not covered by Finnhub (or with empty `finnhubIndustry`): no row inserted in `sectors` table

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 3: Sector allocation logic + donut chart + DashboardView integration

### Overview

Add `SectorSlice` and `computeSectorAllocation` to `portfolio.ts`. Install chart.js and react-chartjs-2. Create the `SectorAllocationChart` React component. Update `DashboardView` to accept `initialSectors`, compute the allocation, and render the chart above the portfolio table.

### Changes Required:

#### 1. Add `SectorSlice` type and `computeSectorAllocation` to portfolio.ts

**File**: `src/lib/portfolio.ts`

**Intent**: Define the `SectorSlice` output type and provide the pure `computeSectorAllocation` function that maps positions + sectors into a sorted slice array. Positions with null `positionValue` are excluded (no price → no value contribution). Tickers without a known sector fall into "Other". The result is sorted descending by value with "Other" always last.

**Contract**:

Export `SectorSlice`:
```typescript
export interface SectorSlice {
  sector: string;
  value: number;
  percentage: number;
}
```

Export `computeSectorAllocation(positions: PortfolioPosition[], sectors: Record<string, string>): SectorSlice[]`:
- Filter positions where `positionValue !== null`
- For each: `const sector = sectors[position.ticker] ?? "Other"`
- Group by sector, summing `positionValue`
- `total = sum of all sectorValues`; if `total === 0` return `[]`
- Map to `SectorSlice`: `percentage = (value / total) * 100`
- Sort descending by `value`; then move any "Other" entry to the end regardless of its value

#### 2. Install charting library

No file changes — run `npm install chart.js react-chartjs-2` before implementing the component.

#### 3. Create `SectorAllocationChart` component

**File**: `src/components/portfolio/SectorAllocationChart.tsx` *(new file)*

**Intent**: A self-contained React component rendering a Chart.js Doughnut chart from `SectorSlice[]`. Handles the empty state. Assigns colors from a fixed palette; "Other" is always gray.

**Contract**:
- At module scope (before the component): `Chart.register(ArcElement, Tooltip, Legend)`
- Props: `{ slices: SectorSlice[] }`
- Color palette: define a constant array of ≥10 distinct hex colors (suggested: use a set of distinct, saturated colors — one per recognizable sector; "Other" is always `"#6B7280"` regardless of palette position)
- When `slices.length === 0`: render an empty-state card — a centered message ("No positions to display") inside a rounded border, matching the visual tone of the existing table empty state
- Doughnut `data`: labels = `slices.map(s => s.sector)`; datasets[0].data = `slices.map(s => s.value)`; backgroundColor = color assigned per slice (by index in palette, with "Other" forced to gray)
- Doughnut `options`: `responsive: true`, `maintainAspectRatio: false`, tooltip callback showing `${sector}: ${percentage.toFixed(1)}%` and formatted value
- Wrap `<Doughnut>` in `<div className="relative h-[300px]">` to give the canvas a concrete height (see Critical Implementation Details)

#### 4. Update `DashboardView.tsx`

**File**: `src/components/transactions/DashboardView.tsx`

**Intent**: Accept `initialSectors`, compute sector allocation in a `useMemo` alongside the existing `computePositions` call, and render `SectorAllocationChart` above the portfolio table in a full-width card section.

**Contract**:
- Add `initialSectors: Record<string, string>` to the Props interface
- `const [sectors] = useState(initialSectors)` — static after mount (same pattern as `prices`)
- `const sectorSlices = useMemo(() => computeSectorAllocation(positions, sectors), [positions, sectors])` — import `computeSectorAllocation` and `SectorSlice` from `@/lib/portfolio`
- Import `SectorAllocationChart` from `@/components/portfolio/SectorAllocationChart`
- Render the chart above the table: wrap `<SectorAllocationChart slices={sectorSlices} />` in a card element (e.g., `<div className="...rounded-xl border bg-...p-4 mb-6">` with a heading "Sector Allocation") placed before the existing table section in the JSX return

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes with zero errors
- `npm run lint` passes
- `npm run build` succeeds

#### Manual Verification:

- Logged-in user with ≥ 1 priced position sees a donut chart above the portfolio table with a "Sector Allocation" heading
- Each slice is a different color; "Other" (if present) is gray
- Hovering a slice shows sector name, percentage, and value in the tooltip
- Sector percentages are plausible given the portfolio positions
- Adding a transaction via the modal: the chart updates immediately (no page reload) — allocation recomputes through the useMemo chain
- User with zero transactions sees the empty-state card in the chart area
- User whose tickers have no Finnhub sector coverage: a gray "Other" slice covers 100%

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before marking the phase complete.

---

## Testing Strategy

### Manual Testing Steps:

1. Open dashboard with a known portfolio (≥ 2 different sectors) → verify slice sizes visually match expected allocation by market value
2. Compute expected allocation manually: sum `positionValue` per sector from the table; verify percentages match chart
3. Add a transaction in a new sector → verify the chart immediately shows the new sector slice
4. Add a transaction in an existing sector → verify that sector's slice grows proportionally
5. Delete a transaction → verify the chart reallocates without page reload
6. Simulate an unknown ticker (one with no Finnhub profile): verify it appears as "Other" gray slice
7. Empty portfolio: verify the chart area shows the empty-state card, not a broken chart

## Performance Considerations

Sector fetches run after price fetches in dashboard.astro. Both are `Promise.allSettled` batches. On first load with N unique tickers: up to 2N Finnhub calls (N quotes + N profiles). With the 60 req/min Finnhub free tier and p-limit rate cap already in place for prices, apply the same rate limit to the sector batch to avoid rate limiting. After the first load, the 7-day cache eliminates sector calls entirely on subsequent visits — only price calls run.

## Migration Notes

No changes to the `transactions` or `prices` tables. The new `sectors` table is additive. If the migration has not been applied, the `supabase.from("sectors")` query will error — the `sectors` block should be wrapped in the same supabase null-check guard already present in the prices block.

## References

- PRD: `context/foundation/prd.md` §FR-008
- Roadmap: `context/foundation/roadmap.md` S-05
- EOD API decision: `context/foundation/eod-api-decision.md`
- Lessons: `context/foundation/lessons.md` L1 (text env vars), L3 (double quotes in TS)
- Prior plan (S-03): `context/archive/2026-06-09-portfolio-roi-view/plan.md` — Finnhub patterns, prices table shape

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: DB migration — `sectors` cache table

#### Automated

- [x] 1.1 Migration applies cleanly (`npx supabase db push` or SQL Editor)
- [x] 1.2 `npx astro check` passes
- [x] 1.3 `npm run lint` passes

#### Manual

- [ ] 1.4 `sectors` table visible in Supabase Dashboard with correct columns
- [ ] 1.5 RLS enabled on `sectors` table

### Phase 2: Finnhub sector client + dashboard.astro wiring

#### Automated

- [ ] 2.1 `npx astro check` passes
- [ ] 2.2 `npm run lint` passes

#### Manual

- [ ] 2.3 Supabase `sectors` table has rows after first page load
- [ ] 2.4 Second load within 7 days does not update `fetched_at` (cache hit)
- [ ] 2.5 Ticker with no Finnhub coverage: no row in `sectors` table

### Phase 3: Sector allocation logic + donut chart + DashboardView integration

#### Automated

- [ ] 3.1 `npx astro check` passes with zero errors
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 `npm run build` succeeds

#### Manual

- [ ] 3.4 Donut chart renders above portfolio table with "Sector Allocation" heading
- [ ] 3.5 Slice percentages match expected allocation by position value
- [ ] 3.6 Tooltip shows sector name, percentage, and value
- [ ] 3.7 "Other" slice is gray when present
- [ ] 3.8 Adding a transaction updates the chart without page reload
- [ ] 3.9 Empty portfolio shows empty-state card in chart area
