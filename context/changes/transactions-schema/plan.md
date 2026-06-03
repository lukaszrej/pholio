# Transactions Schema Implementation Plan

## Overview

Create the `transactions` table in Supabase with Row Level Security, a user_id index, and hand-written TypeScript types. This is the data foundation that unlocks S-02 (add transaction) and S-03 (portfolio view) — no application code changes, just the schema and types.

## Current State Analysis

- `supabase/config.toml` exists with PostgreSQL v17 and Supabase CLI configured; `supabase/migrations/` directory does not exist yet
- `src/lib/supabase.ts` provides a per-request client factory using `@supabase/ssr` — ready to query transactions once the table exists
- `src/env.d.ts` declares `App.Locals.user` (Supabase User type); no domain types for transactions exist yet
- Auth middleware protects `/dashboard` and exposes `Astro.locals.user` — the `user_id` to scope every query

## Desired End State

After this plan is complete:
- A `public.transactions` table exists in Supabase with all fields required by FR-004, RLS enabled, and a user_id index
- Every future query for the authenticated user's transactions passes RLS automatically
- `src/types/transaction.ts` exports `Transaction`, `NewTransaction`, and `UpdateTransaction` — importable by S-02 and S-03 without changes to this schema

### Verify:
1. Supabase Dashboard → Table Editor shows `transactions` with 9 columns
2. Dashboard → Authentication → Policies shows 4 policies on `transactions`
3. `npm run typecheck` passes with the new types file in place

### Key Discoveries:

- `supabase` CLI is already in `devDependencies` (`^2.102.0`) — use `npx supabase` without global install
- `supabase/migrations/` directory is absent; `supabase migration new` creates it on first run
- Per-request client in `src/lib/supabase.ts:9` (`createServerClient`) is correct for Cloudflare Workers — no change needed
- All auth routes use the same `createClient()` pattern; transactions queries will follow suit

## What We're NOT Doing

- No API routes for transactions (S-02)
- No UI for adding or listing transactions (S-02, S-03)
- No seed data or test fixtures
- No Supabase-generated type file (`database.types.ts`) — manual interface chosen
- No soft-delete column — hard delete chosen in PRD §FR-006

## Implementation Approach

One Supabase CLI migration file handles the entire DB layer: table creation, CHECK constraints, RLS enable, four RLS policies, an `updated_at` trigger, and the user_id index. A companion TypeScript file exposes the schema as typed interfaces for the application layer.

## Critical Implementation Details

**Updated_at trigger** — PostgreSQL does not auto-update `updated_at` on row mutations. Without a BEFORE UPDATE trigger that sets `NEW.updated_at = now()`, the column will always equal `created_at`. The trigger function must be created before the trigger, both in the same migration file.

---

## Phase 1: SQL Migration

### Overview

Create the `supabase/migrations/` directory via the Supabase CLI, write the migration SQL, and push it to the remote project. This is the only phase that touches the database.

### Changes Required:

#### 0. Link project to remote Supabase

**Command**: `npx supabase link --project-ref <ref>`

**Intent**: Bind the local CLI to the remote Supabase project so `db push` knows where to send the migration. The `<ref>` is the alphanumeric string after `project/` in your Supabase Dashboard URL (e.g. `abcdefghijklmnop`). Skip this step if `.supabase/` already exists in the repo root.

#### 1. Generate migration file

**Command**: `npx supabase migration new create_transactions`

**Intent**: Creates a timestamped file at `supabase/migrations/<timestamp>_create_transactions.sql` (and the `migrations/` directory on first use). The timestamp determines migration order — do not rename the file after generation.

#### 2. Migration SQL content

**File**: `supabase/migrations/<timestamp>_create_transactions.sql`

**Intent**: Define the full schema for the transactions table including columns, constraints, RLS, trigger, and index.

**Contract**: The migration must be idempotent-friendly and contain these logical blocks in order:

1. Create `public.transactions` table with columns:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
   - `ticker TEXT NOT NULL`
   - `purchase_price NUMERIC(15,4) NOT NULL CHECK (purchase_price > 0)`
   - `purchase_date DATE NOT NULL`
   - `currency TEXT NOT NULL CHECK (currency IN ('PLN','USD','EUR','GBP','CHF','CAD','AUD','JPY','DKK','NOK','SEK'))`
   - `shares NUMERIC(15,4) NOT NULL CHECK (shares > 0)`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

2. Enable RLS: `ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;`

3. Four RLS policies (one per operation):
   - SELECT: `USING (auth.uid() = user_id)`
   - INSERT: `WITH CHECK (auth.uid() = user_id)`
   - UPDATE: `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
   - DELETE: `USING (auth.uid() = user_id)`

4. `updated_at` trigger function + trigger (`BEFORE UPDATE FOR EACH ROW`):
   ```sql
   CREATE OR REPLACE FUNCTION public.set_updated_at()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.updated_at = now();
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER set_transactions_updated_at
     BEFORE UPDATE ON public.transactions
     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
   ```

5. Index: `CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);`

#### 3. Apply migration

**Command**: `npx supabase db push`

**Intent**: Pushes the migration to the linked remote Supabase project (linked in step 0).

### Success Criteria:

#### Automated Verification:

- `npx supabase db push` exits with code 0 (no errors)
- Migration file exists at `supabase/migrations/<timestamp>_create_transactions.sql` and is committed

#### Manual Verification:

- Supabase Dashboard → Table Editor → `transactions` shows 9 columns with correct types
- Dashboard → Authentication → Policies → `transactions` shows 4 policies with RLS enabled
- Attempting to query the table as a logged-in user returns an empty array (not an error)
- Unauthenticated query returns an empty array `[]` with HTTP 200 (not an error) — confirms RLS is filtering rows, not throwing

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: TypeScript Types

### Overview

Add a hand-written TypeScript file that exposes the transactions schema as typed interfaces. No build step required — the file is consumed directly by S-02 and S-03 components.

### Changes Required:

#### 1. Create types file

**File**: `src/types/transaction.ts`

**Intent**: Export the `Transaction` interface matching the DB schema exactly, plus `NewTransaction` and `UpdateTransaction` helper types for insert and update operations so S-02 and S-03 don't need to inline field lists.

**Contract**: 
- `Currency` — union type matching the CHECK constraint values
- `Transaction` — full row shape (all 9 columns); numeric fields are `number` since Supabase JS returns `NUMERIC` as number; date fields are `string` (`'YYYY-MM-DD'` for DATE, ISO string for TIMESTAMPTZ)
- `NewTransaction` — `Omit<Transaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>` — the shape a form submits
- `UpdateTransaction` — `Partial<NewTransaction>` — the shape an edit operation patches

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes with zero errors
- `npm run build` succeeds (no import errors)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Manual Testing Steps:

1. Open Supabase Dashboard → SQL Editor; run `SELECT * FROM transactions;` as the service role — expect empty result, not an error
2. Attempt the same query with RLS enforced (anon role) — expect "new row violates row-level security policy" or empty result depending on policy mode
3. In the app, navigate to `/dashboard` as a logged-in user — no crash (table is empty but queryable)
4. Import `Transaction` from `src/types/transaction.ts` in a scratch Astro component — TypeScript reports no errors

## References

- PRD: `context/foundation/prd.md` §FR-004, §AC
- Roadmap: `context/foundation/roadmap.md` F-01

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: SQL Migration

#### Automated

- [ ] 1.1 `npx supabase db push` exits with code 0
- [ ] 1.2 Migration file committed to git

#### Manual

- [ ] 1.3 Dashboard shows `transactions` table with 9 columns and correct types
- [ ] 1.4 Dashboard shows 4 RLS policies with RLS enabled on the table
- [ ] 1.5 Querying as logged-in user returns empty array (not error)
- [ ] 1.6 Unauthenticated query returns empty array (not an error) — RLS filtering rows, not throwing

### Phase 2: TypeScript Types

#### Automated

- [ ] 2.1 `npx astro check` passes with zero errors
- [ ] 2.2 `npm run build` succeeds
