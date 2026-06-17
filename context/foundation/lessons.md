# Lessons — Recurring Rules & Pitfalls

## L1 — Cloudflare Workers: use text env vars, not secrets, for `astro:env/server`

**Context:** `@astrojs/cloudflare` v13 + Astro v6 + `nodejs_compat`

`wrangler secret put` stores values encrypted and exposes them only via the Cloudflare `env` binding object (the fetch handler's second argument, or `import { env } from "cloudflare:workers"`). However, `astro:env/server` defaults to reading from `process.env[key]`. The `setGetEnv(createGetEnv(env))` bridging mechanism in the built worker is supposed to switch the reader to Cloudflare's env object at module init, but it does not reliably do so in practice — resulting in `SUPABASE_URL` / `SUPABASE_KEY` staying `undefined` at runtime despite secrets being correctly set.

**Rule:** For values consumed via `astro:env/server` (e.g. `SUPABASE_URL`, `SUPABASE_KEY`), add them as **text environment variables** in the Cloudflare dashboard (Workers → pholio → Settings → Variables and Secrets), not as wrangler secrets. With `nodejs_compat`, text vars are injected into `process.env` at Worker startup, which is what `astro:env` reads.

**Scope:** Only use `wrangler secret put` for credentials that must never appear in plaintext in the dashboard (e.g. service role keys, private API keys). Supabase anon keys and project URLs are public by design and safe as text vars.

---

## L2 — Disable Cloudflare's GitHub integration when using GitHub Actions for CD

If you connect a Cloudflare Worker to a GitHub repo via the Cloudflare dashboard's Git Integration, Cloudflare triggers its own build-and-deploy on every push — independently of GitHub Actions. This build runs without your GitHub secrets (no `SUPABASE_URL`, etc.), produces a broken artifact, and deploys it AFTER GitHub Actions finishes, overwriting the correct build.

**Rule:** When GitHub Actions owns the deploy pipeline (`cloudflare/wrangler-action`), disconnect the Cloudflare Git Integration: Workers → pholio → Settings → Git Integration → Disconnect. These two CD paths are mutually exclusive; running both causes the last one to win (usually Cloudflare's broken build).

---

## Always include both USING and WITH CHECK on Supabase RLS UPDATE policies

- **Context**: `supabase/migrations/` — any table with an UPDATE RLS policy
- **Problem**: The `prices` migration's UPDATE policy only had `USING (auth.role() = 'authenticated')`, missing `WITH CHECK`. A follow-up fix migration (`20260609000001`) was needed to add it. Without `WITH CHECK`, Postgres enforces the condition on existing rows being read but not on the new row values being written.
- **Rule**: Always define RLS UPDATE policies with both `USING (...)` **and** `WITH CHECK (...)`. Write both clauses even when they're identical.
- **Applies to**: 10x-implement, 10x-plan, 10x-impl-review — any task touching Supabase migrations

---

## When specifying utility helper signatures in plans, check actual TypeScript field types

- **Context**: `src/lib/format.ts` — format helpers consumed by portfolio/transaction UI components
- **Problem**: Plan spec'd `formatShares(n: number)` but `Transaction.shares` is `number | null`. Implementation correctly widened the signature, but it created a plan-drift note that was avoidable. Database-backed interfaces frequently have nullable fields.
- **Rule**: Before specifying a function signature in a plan, look up the actual TypeScript type of the fields it will receive (especially in `src/types/`). Format helpers that receive database-sourced values should default to accepting `T | null` signatures unless the field is provably non-nullable in the schema.
- **Applies to**: 10x-plan, 10x-impl-review — any task specifying utility or format function signatures

---

## In Zod v4, use z.uuid() not z.string().uuid()

- **Context**: `src/lib/transaction-schema.ts` — any Zod schema in the project
- **Problem**: Plan spec'd `z.string().uuid("Invalid portfolio ID")` (Zod v3 form). Implementation correctly used `z.uuid({ message: "Invalid portfolio ID" })` — the Zod v4 standalone API. Both validate identically, but the v3 form in plans will create misleading drift notes in future reviews.
- **Rule**: In Zod v4, UUID validation is a standalone schema: `z.uuid({ message: "..." })`. Do not use `z.string().uuid("message")` — that is the Zod v3 refinement form. Same applies to other standalone schemas: `z.email()`, `z.url()`, `z.ip()`.
- **Applies to**: 10x-plan, 10x-implement, 10x-impl-review — any task specifying or reviewing Zod validation schemas

---

## Always use double quotes in TypeScript files

- **Context**: Any new TypeScript file in src/
- **Problem**: CI lint fails — Prettier enforces double quotes; single quotes cause eslint/prettier errors that break the CI pipeline. Happened in src/types/transaction.ts (Currency union and Omit<> keys used single quotes, caught by CI run #8).
- **Rule**: Always use double quotes in TypeScript files — single quotes fail the Prettier lint check.
- **Applies to**: implement, impl-review

---

## Always initialize husky before the first commit when wiring CI gates

- **Context**: When adding husky as a devDependency alongside a CI lint/typecheck pipeline.
- **Problem**: husky was listed in devDependencies and `.husky/` hook files existed, but `git config core.hooksPath` was never set — git silently skipped all hooks. Prettier and TypeScript-ESLint errors sailed through local commits undetected and broke the remote CI run.
- **Rule**: After adding husky as a devDependency, always add `"prepare": "husky"` to `package.json` scripts AND verify `git config core.hooksPath` resolves to `.husky` before the first commit. Pair the pre-commit lint-staged hook with a pre-push full-lint hook as a second line of defence.
- **Applies to**: all

---

## The `prices` table allows any authenticated user to INSERT/UPDATE prices

- **Context**: `supabase/migrations/20260609000000_create_prices.sql` — RLS policies on `prices` table
- **Problem**: The `prices` RLS policies deliberately allow any authenticated user to INSERT and UPDATE prices ("any authenticated user can read and upsert prices"). In practice, price writes flow through server-side code via the service-role key, but a regular authenticated user could write arbitrary price rows directly — affecting portfolio valuations across all users.
- **Rule**: [TODO]
- **Applies to**: [TODO]
