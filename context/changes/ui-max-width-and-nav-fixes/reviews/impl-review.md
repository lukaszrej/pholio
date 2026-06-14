<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: UI Max-Width, Portfolio Table Width, and Nav Tab Centering

- **Plan**: context/changes/ui-max-width-and-nav-fixes/plan.md
- **Scope**: Phase 1 of 1
- **Date**: 2026-06-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Max-width value is 1152, plan specified 1024

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/transactions/DashboardView.tsx:415
- **Detail**: Plan contract specified `{ maxWidth: 1024, margin: "0 auto" }`. Implementation uses `{ maxWidth: 1152, margin: "0 auto", padding: "0 16px" }`. 1152px = Tailwind max-w-6xl (72rem) — the value from the archived predecessor change (commit 9d49654 used `mx-auto max-w-6xl`). The plan text "restore the 1024 px max-width constraint" was inaccurate; the previous constraint was 1152px.
- **Fix A ⭐ Recommended**: Accept 1152 and note in a plan addendum — matches the pre-rewrite layout exactly; plan text was wrong.
- **Decision**: FIXED via Fix A — addendum added to plan.md

### F2 — Sidebar column width narrowed from 320px to 256px (unplanned)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/styles/global.css:177
- **Detail**: Plan's "What We're NOT Doing" listed "Changing any spacing, padding, or colour tokens." The portfolio sidebar column was silently narrowed: `grid-template-columns: 1fr 320px` → `1fr 256px`. 64px removed from the sidebar, giving more room to the holdings table.
- **Fix A ⭐ Recommended**: Accept 256px and document in the plan addendum.
- **Decision**: FIXED via Fix A — addendum added to plan.md

### F3 — Body background added to Layout.astro (not in plan)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/layouts/Layout.astro:49
- **Detail**: `background: #eef1f6` added to `html, body` block. Not in the plan, but functionally required to show gray gutters. Hardcoded hex matched `--tl-bg` exactly; swapped for the design token during triage.
- **Fix**: Accept and align with CSS variable `--tl-bg`.
- **Decision**: FIXED — hex replaced with `var(--tl-bg)` in Layout.astro; addendum added to plan.md

### F4 — NavTabs internal restructuring beyond plan contract

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/transactions/DashboardView.tsx:143–149
- **Detail**: Plan only specified adding `justifyContent: "center"` to tabBtnStyle. Implementation also restructured NavTabs internals (removed internal padding/border-bottom/background; moved to parent wrapper). These are necessary structural side-effects of the max-width wrapper approach.
- **Fix**: Accept as undocumented structural side-effect. No code change.
- **Decision**: FIXED (accepted) — no code change required
