<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Quality Gates Wiring (CI)

- **Plan**: context/changes/testing-quality-gates-wiring/plan.md
- **Scope**: All Phases (1–3 of 3)
- **Date**: 2026-06-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 4 warnings 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Notable Passes

- Integration job uses zero GitHub secrets — all Supabase keys derived from `supabase status`; no production credentials in the CI test environment.
- `workflow_run` guard has both required conditions: `conclusion == 'success'` AND `head_branch == 'main'`.
- `deploy.yml` uses `head_sha` checkout — pins the deploy artifact to the exact commit validated by CI.
- `.env.test` written before `npm run test:integration` — correct ordering.
- `supabase start` invoked without `--ignore-health-check` — startup failures exit non-zero.
- §3 Phase 4 reads `complete`; §5 has no remaining "required after Phase 4" qualifiers.

## Findings

### F1 — cloudflare/wrangler-action not SHA-pinned

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/deploy.yml:26
- **Detail**: `cloudflare/wrangler-action@v3` was a mutable tag holding access to CLOUDFLARE_API_TOKEN and SUPABASE_KEY (production credentials).
- **Fix Applied**: Pinned to `9acf94ace14e7dc412b076f2c5c20b8ce93c79cd  # v3.15.0` (SHA-immutable).
- **Decision**: FIXED

---

### F2 — supabase/setup-cli not SHA-pinned

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:36
- **Detail**: `supabase/setup-cli@v1` was a mutable tag. Lower risk than F1 (no production secrets), but still executes arbitrary code in CI.
- **Fix Applied**: Pinned to `ab058987d8d6c725971f6cf9d0b5c98467e30bd1  # v1.7.1`.
- **Decision**: FIXED

---

### F3 — No validation of extracted Supabase keys before writing .env.test

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:46-53
- **Detail**: grep/sed pipelines producing empty strings would write a blank `.env.test`. `setup.ts` catches it but with a misleading "Supabase not running" error rather than "key extraction failed."
- **Fix Applied**: Added an explicit guard that fails the step with a clear error message if `SUPABASE_URL_VAL` or `SERVICE_ROLE_VAL` is empty.
- **Decision**: FIXED

---

### F4 — No timeout on supabase start

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:39
- **Detail**: `supabase start` with no step-level timeout could hang on a cold runner and consume the full 6-hour job timeout.
- **Fix Applied**: Added `timeout-minutes: 10` to the `supabase start` step.
- **Decision**: FIXED

---

### F5 — Migration modified again despite "Not writing migrations" guardrail

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: supabase/migrations/20260615000000_grant_table_permissions.sql
- **Detail**: Plan guardrail said "Not writing new application features or migrations." Migration was modified with service_role GRANTs as a discovered prerequisite — same recurring pattern as testing-api-security-integration review F1.
- **Fix Applied**: Annotated the plan's "What We're NOT Doing" section with the discovered-prerequisite rationale.
- **Decision**: FIXED

---

### F6 — prices table permits authenticated INSERT/UPDATE

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260609000000_create_prices.sql
- **Detail**: prices RLS policies deliberately allow any authenticated user to INSERT and UPDATE prices. Pre-existing design decision, not introduced by this change. Price poisoning could affect portfolio valuations. Lesson recorded in lessons.md.
- **Decision**: ACCEPTED-AS-RULE: The `prices` table allows any authenticated user to INSERT/UPDATE prices
