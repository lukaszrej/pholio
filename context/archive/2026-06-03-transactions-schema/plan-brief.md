# Transactions Schema — Plan Brief

> Full plan: `context/changes/transactions-schema/plan.md`

## What & Why

Create the `transactions` table in Supabase with Row Level Security and hand-written TypeScript types. This is the data foundation (F-01) that unlocks S-02 (add transaction form) and S-03 (portfolio ROI view) — without it, no application feature can store or read user data.

## Starting Point

`supabase/config.toml` is present and `supabase` CLI is in devDependencies, but the `supabase/migrations/` directory does not exist yet and there are no schema or SQL files in the project. The Supabase client (`src/lib/supabase.ts`) is ready and auth is complete.

## Desired End State

A `public.transactions` table exists in the remote Supabase project with 9 columns, RLS enabled, and 4 user-scoped policies. A `src/types/transaction.ts` file exports `Transaction`, `NewTransaction`, and `UpdateTransaction` interfaces that S-02 and S-03 can import without further schema changes.

## Key Decisions Made

| Decision           | Choice                                         | Why (1 sentence)                                                                | Source |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------- | ------ |
| Migration workflow | Supabase CLI (`migration new` + `db push`)     | Local file in git + automated apply; CLI already in devDeps                     | Plan   |
| TypeScript types   | Manual interface in `src/types/transaction.ts` | No tooling dependency; readable and editable without a generate step            | Plan   |
| Numeric type       | `NUMERIC(15,4)` for price and shares           | Handles fractional shares and multi-decimal prices without floating-point drift | Plan   |
| Currency storage   | `TEXT` with CHECK constraint                   | Blocks garbage data at DB level without the rigidity of a PostgreSQL ENUM       | Plan   |
| user_id index      | Yes                                            | Every app query filters by `user_id`; index is O(log n) vs sequential scan      | Plan   |

## Scope

**In scope:**

- `public.transactions` table with 9 columns
- RLS enable + 4 policies (SELECT, INSERT, UPDATE, DELETE)
- `updated_at` auto-update trigger
- `idx_transactions_user_id` index
- `src/types/transaction.ts` with `Transaction`, `NewTransaction`, `UpdateTransaction`

**Out of scope:**

- API routes for transactions (S-02)
- UI for adding or listing transactions (S-02, S-03)
- Seed data or test fixtures
- Supabase-generated `database.types.ts`
- Soft-delete column (hard delete chosen in PRD §FR-006)

## Architecture / Approach

Single Supabase CLI migration handles the entire DB layer (table, constraints, RLS, trigger, index). One TypeScript file exposes the schema as typed interfaces. No application code changes; S-02 and S-03 will import from `src/types/transaction.ts` and call `createClient()` directly.

## Phases at a Glance

| Phase               | What it delivers                                         | Key risk                                                                     |
| ------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1. SQL Migration    | `transactions` table live in Supabase with RLS and index | `supabase link` may need project ref ID from Dashboard if not already linked |
| 2. TypeScript Types | `src/types/transaction.ts` exportable by future slices   | None — pure type file, no runtime behavior                                   |

**Prerequisites:** Supabase project exists and is accessible; `npx supabase link` run at least once (or project already linked via `.supabase/` config).
**Estimated effort:** ~1 session across 2 phases

## Open Risks & Assumptions

- Currency CHECK constraint covers PLN, USD, EUR, GBP, CHF, CAD, AUD, JPY, DKK, NOK, SEK — if user needs an unlisted currency, a new migration is required
- `supabase db push` requires the project to be linked; first-time setup needs the project reference ID from the Supabase Dashboard URL

## Success Criteria (Summary)

- `npx supabase db push` exits 0 and the migrations directory is committed
- Supabase Dashboard shows the `transactions` table with 9 columns, RLS enabled, and 4 policies
- `npm run typecheck` passes with the new types file in place
