<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Multi-Portfolio System — Phase 4 Dashboard Restructure

- **Plan**: context/changes/dual-portfolio-view/plan.md
- **Scope**: Phase 4 of 4
- **Date**: 2026-06-13
- **Verdict**: NEEDS ATTENTION → APPROVED after triage (6 fixes applied)
- **Findings**: 0 critical 3 warnings 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Portfolios fetch error silently swallowed in dashboard.astro

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/pages/dashboard.astro:22–24
- **Detail**: The portfolios fetch discarded its error binding. A DB failure returned [] silently; user would see empty dashboard with no diagnostic. Transactions fetch already logged its error — portfolios should match.
- **Fix**: Added `error: portfoliosError` binding and `console.error` call matching the transactions fetch pattern.
- **Decision**: FIXED

### F2 — DELETE count query has implicit RLS dependency in portfolios/[id].ts

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Security)
- **Location**: src/pages/api/portfolios/[id].ts:104–107
- **Detail**: Transaction count pre-check used `.eq("portfolio_id", id)` with no explicit `user_id` filter. Relied silently on transactions RLS to scope results. If RLS is ever relaxed, this could produce a false 409 blocking a legitimate delete.
- **Fix A ⭐**: Added `.eq("user_id", context.locals.user.id)` to the count query as defence-in-depth.
  - Strength: Makes ownership explicit; survives RLS misconfiguration; one .eq() addition.
  - Tradeoff: No behaviour change under correct RLS.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A

### F3 — Stale transactions in DashboardView local state after portfolio delete

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Data Safety)
- **Location**: src/components/transactions/DashboardView.tsx:168–187
- **Detail**: On successful DELETE, setPortfolios removed the portfolio but setTransactions was not called. Transactions belonging to the deleted portfolio remained in state, so allPositions and combinedSummary continued to include phantom data. Currently unreachable (409 guard), but latent risk if server-side guard is relaxed.
- **Fix**: Added `setTransactions((prev) => prev.filter((t) => t.portfolio_id !== deletingPortfolio.id))` after setPortfolios on success.
  - Strength: Keeps "All Portfolios" summary accurate immediately after delete.
  - Tradeoff: If cascade-delete is added later this stays correct.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Decision**: FIXED

### F4 — `embedded` prop: unplanned surface on PortfolioSummaryCard

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/portfolio/PortfolioSummaryCard.tsx:7 / PortfolioSection.tsx:149
- **Detail**: Unplanned `embedded?: boolean` prop was added to suppress the card wrapper when used inside PortfolioSection's outer card. Clean design intent but extra unplanned component API.
- **Fix**: Removed `embedded` prop and the `content` variable abstraction from PortfolioSummaryCard. PortfolioSection now renders `<PortfolioSummaryCard>` (with its own card) followed by a separate card for the table/button/chart.
- **Decision**: FIXED

### F5 — Render order drift: "Add transaction" button appears before sector chart

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/portfolio/PortfolioSection.tsx:261–277
- **Detail**: Plan specified table → sector chart (4) → "Add transaction" button (5). Implementation renders: table → "Add transaction" button → sector chart. Current order is better UX (action button reachable before scrolling past chart).
- **Decision**: SKIPPED (current order is intentional UX improvement)

### F6 — Inline transactions.filter() in JSX defeats PortfolioSection useMemo

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Performance)
- **Location**: src/components/transactions/DashboardView.tsx:245, 274
- **Detail**: `transactions.filter(...)` called inline in JSX per portfolio and for LotsModal, producing new array references on every render, defeating useMemo inside PortfolioSection. Plan's Performance Considerations note called this negligible for 2–3 portfolios / 500 transactions, but user chose to address it proactively.
- **Fix**: Added `txByPortfolio = useMemo(...)` map at DashboardView level; passed `txByPortfolio.get(p.id) ?? []` to PortfolioSection and `txByPortfolio.get(lotsContext.portfolioId) ?? []` to LotsModal.
- **Decision**: FIXED

### F7 — Add portfolio dialog error state not cleared on onOpenChange close

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/transactions/DashboardView.tsx:362–365
- **Detail**: onOpenChange close handler called `setIsAddPortfolioDialogOpen(false)` but not `setAddPortfolioError(null)`. No current bug (all open paths clear the error), but fragile if a second open path is added. Rename dialog correctly clears error on close.
- **Fix**: Added `setAddPortfolioError(null)` to the close branch of onOpenChange.
- **Decision**: FIXED

### F8 — Delete portfolio dialog error display generic vs plan's "409-specific" wording

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/transactions/DashboardView.tsx:463–493
- **Detail**: Plan called out "409 error display" as a distinct requirement. Implementation shows any API error string generically. In practice the server returns the correct user-friendly 409 message ("This portfolio has transactions. Reassign or delete them first."), so the user experience is correct. This was a labelling difference in the plan spec, not a real gap.
- **Decision**: SKIPPED (no code change needed; API message already correct)
