# Cash Position Tracking — Plan Brief

> Full plan: `context/changes/cash-position/plan.md`
> Research: `context/changes/cash-position/research.md`

## What & Why

Add cash deposit/withdrawal tracking so the existing **Cash Position** sidebar (which currently shows `—` because nothing feeds its `cashBalance` prop) displays real balances. Cash is recorded through the existing Add Transaction flow as a new transaction type and is fully manageable (add / view / edit / delete).

## Starting Point

The app has no concept of cash — every `transactions` row is an implicit equity buy. The Cash Position UI already exists and renders `cashBalance`, but `DashboardView` never passes it. The schema, Zod validator, type, form, and compute functions all assume equity.

## Desired End State

A user switches Add Transaction to **Cash**, picks Deposit/Withdrawal, enters amount/date/currency, and saves. The portfolio's Cash Position sidebar shows the running single-currency balance and its % of portfolio value. Cash never appears in the holdings table or sector chart. Clicking Cash Position lists movements for edit/delete. A cash-only portfolio renders its layout instead of the empty-state CTA.

## Key Decisions Made

| Decision            | Choice                                                                                   | Why (1 sentence)                                                                           | Source   |
| ------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| Storage model       | `transaction_type` column on `transactions`; `ticker="CASH"`, `shares=1`, `price=amount` | Reuses all existing infra and satisfies DB constraints with zero constraint migrations     | Research |
| API changes         | None                                                                                     | Routes already spread `result.data`; a schema default carries the field through            | Research |
| Multi-currency      | Single-currency sum (`number`)                                                           | Sidebar shows one Balance + `summary.currency`; portfolios are effectively single-currency | Plan     |
| Form UX             | Stock/Cash toggle + Deposit/Withdrawal sub-toggle                                        | Matches the research blueprint; one modal, reuses submit pipeline                          | Plan     |
| Negative balance    | Allow, no block/warn                                                                     | Simplest; no cash-on-hand enforcement exists elsewhere                                     | Plan     |
| Cash CRUD           | Clickable Cash Position → LotsModal (`ticker="CASH"`)                                    | Reuses existing lots + edit/delete wiring verbatim                                         | Plan     |
| Cash-only portfolio | Render layout with empty holdings + populated Cash Position                              | Cash is first-class; user must see their balance without stocks                            | Plan     |
| Testing             | Unit tests on `computeCashBalance` + cash filter                                         | Covers the heart of the feature cheaply; matches existing test file                        | Plan     |

## Scope

**In scope:** `transaction_type` migration; type + Zod field; `computeCashBalance` + cash filter in `computePositions`; Stock/Cash form mode; per-portfolio cash wiring in DashboardView; empty-state fix; cash CRUD via LotsModal; unit tests.

**Out of scope:** per-currency balances; negative-balance prevention; cash in "All portfolios" view, ticker-card grid, or compact mode; component/integration tests; FX conversion.

## Architecture / Approach

Bottom-up across the existing stack: DB discriminator → type/schema → pure logic (`computeCashBalance`, cash filter) → form input path → display + empty-state read path → CRUD management path. The additive column means no existing rows/constraints change and the API layer is untouched. Cash CRUD piggybacks on LotsModal by treating `"CASH"` as a ticker.

## Phases at a Glance

| Phase                      | What it delivers                                                       | Key risk                                                              |
| -------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Data Foundation & Logic | Migration, type, schema, `computeCashBalance`, cash filter, unit tests | Migration must backfill existing rows (handled by `DEFAULT 'equity'`) |
| 2. Cash Entry Form         | Stock/Cash toggle + Deposit/Withdrawal; auto-set sentinel fields       | Conditional field rendering + edit-mode detection                     |
| 3. Display & Empty-State   | Per-portfolio cash wired to sidebar; cash-only layout                  | Relocating the empty-state guard relative to the `positions` memo     |
| 4. Cash CRUD               | Clickable Cash Position → cash LotsModal with edit/delete              | LotsModal + edit-form cash-aware branch (largest piece)               |

**Prerequisites:** Supabase migration access (local or remote). No new dependencies.
**Estimated effort:** ~2–3 sessions across 4 phases.

## Open Risks & Assumptions

- Mixed-currency cash within one portfolio produces a meaningless sum — accepted (single-currency assumption).
- Negative balances are possible via typo with no guardrail — accepted by design.
- The empty-state guard relocation must sit below the `positions` `useMemo` (`PortfolioSection.tsx:151`); getting the order wrong risks a render error.

## Success Criteria (Summary)

- Adding cash deposits/withdrawals updates the Cash Position Balance and % of Portfolio correctly.
- Cash never appears in holdings or sector allocation; equity behavior is unchanged.
- Cash movements can be viewed, edited, and deleted; a cash-only portfolio shows its balance instead of "No positions yet".
