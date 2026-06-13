<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Sector Allocation Chart — Phase 2

- **Plan**: context/changes/sector-allocation-chart/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-06-11
- **Verdict**: NEEDS ATTENTION (all findings resolved during triage)
- **Findings**: 0 critical | 1 warning | 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Findings

### F1 — astro check marked ✅ in Progress but exited with 1 error

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: src/pages/dashboard.astro:98 / src/components/transactions/DashboardView.tsx:18
- **Detail**: `npx astro check` failed with "Property 'initialSectors' does not exist on type 'IntrinsicAttributes & Props'". Progress item 2.1 was marked [x] as passing, but the check exited non-zero. The plan said the error was "acceptable at this phase boundary" but the checkbox was ticked anyway.
- **Fix Applied**: Added `initialSectors?: Record<string, string>` as optional prop to DashboardView's Props interface (bridge until Phase 3 wires it up). astro check now exits 0.
- **Decision**: FIXED via Fix A

### F2 — fetchSector used URL query param token; fetchQuote uses header

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/finnhub.ts:13
- **Detail**: fetchSector embedded FINNHUB_API_KEY as `&token=` in the URL (as explicitly planned). fetchQuote uses `X-Finnhub-Token` header. URL-embedded keys appear in Cloudflare Worker and Finnhub server logs (server-side only; no browser exposure). The plan spec itself included the token in the URL — this was a plan-level detail worth fixing.
- **Fix Applied**: Removed `&token=...` from URL, added `headers: { "X-Finnhub-Token": FINNHUB_API_KEY }` to fetch options in fetchSector. Now matches fetchQuote's pattern exactly.
- **Decision**: FIXED

### F3 — `result` variable shadowed outer `result` in sector loop

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard.astro:79
- **Detail**: `const result = await fetchSector(ticker)` inside the sectorLimit closure shadowed the module-level `const result = supabase ? await...` at line 12. The prices block uses `quote` for the fetched value — the sector loop should be symmetrically named `sector`.
- **Fix Applied**: Renamed to `const sector = await fetchSector(ticker)` with corresponding `if (sector !== null)` and `sectors[ticker] = sector`.
- **Decision**: FIXED
