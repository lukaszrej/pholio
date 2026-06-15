# Quality Gates Wiring (CI enforcement) Implementation Plan

## Overview

Phases 1–3 of the test rollout (`context/foundation/test-plan.md` §3) landed a
unit suite and an integration suite, but nothing runs them in CI. `ci.yml`
currently runs only `lint` + `build`, and `deploy.yml` deploys to Cloudflare on
every push to `main` **independently of CI**. The result: a change with a failing
test — or even a failing lint — can reach production through a direct push.

This change wires both Vitest suites into GitHub Actions as hard-required gates,
makes the production deploy depend on a green CI run, and closes the merge path
with branch protection so a red PR cannot merge. After this phase, the §5
"required after Phase 4" gates are satisfied and Risk #1–#6 are enforced, not
merely covered locally.

## Current State Analysis

- **`.github/workflows/ci.yml`** — runs on push/PR to `main`. Single `ci` job:
  `checkout → setup-node 22 → npm ci → npx astro sync → npm run lint → npm run build`.
  The `build` step gets `SUPABASE_URL`/`SUPABASE_KEY` from secrets. **No tests run.**
- **`.github/workflows/deploy.yml`** — runs on push to `main`. Builds and deploys
  via `cloudflare/wrangler-action@v3`. **Has no dependency on `ci.yml`** — fires in
  parallel with CI on the same push event.
- **`package.json` scripts**: `test` = `vitest run` (unit), `test:integration` =
  `vitest run --config vitest.integration.config.ts`. `typecheck` = `astro check`
  (not currently run in CI — out of scope here, see "What We're NOT Doing").
- **Unit suite** (`vitest.config.ts`): Node env, excludes `*.integration.test.ts`,
  aliases `@` and `astro:env/server`. Pure functions — no DB, no network.
- **Integration suite** (`vitest.integration.config.ts`): Node env, includes
  `src/**/*.integration.test.ts`, `setupFiles: src/test/integration/setup.ts`,
  loads `.env.test` via `loadEnv` and injects through the `env` option. Aliases
  `@`, `astro:env/server`, `astro:middleware`.
- **`src/test/integration/setup.ts`** — fast-fails unless `SUPABASE_URL` is set and
  `${SUPABASE_URL}/auth/v1/health` returns OK within 5s. So the integration job
  needs a **live Supabase auth server**, not a bare Postgres.
- **Fixture** (`src/test/integration/helpers/users.ts`) — requires `SUPABASE_URL`,
  `SUPABASE_KEY` (anon), and `SUPABASE_SERVICE_ROLE_KEY`. Creates two real users,
  seeds rows, asserts under anon+JWT clients.
- **`supabase/migrations/`** exists; `supabase start` applies migrations to the
  local stack automatically and prints the URL + local anon/service-role keys.
- **lessons.md L-husky / L-doublequotes** — husky `core.hooksPath` is already wired
  (pre-commit + pre-push exist); any new TS must use double quotes or lint fails.

## Desired End State

- A push or PR to `main` runs lint + the unit suite + the integration suite in CI.
- Any failing test (unit or integration) fails the CI workflow.
- The Cloudflare deploy runs **only after** CI concludes `success` on `main`.
- A PR with a red CI cannot be merged (branch protection requires the CI checks).
- `test-plan.md` §5 gate rows for unit/integration/Finnhub/CI-enforcement read as
  wired, and §3 Phase 4 status reads `complete`.

**Verification of end state:** Open a throwaway PR that intentionally breaks one
unit assertion → CI fails, the PR's merge button is blocked, and no deploy runs.
Revert → CI passes, deploy fires after CI success.

### Key Discoveries:

- `deploy.yml` is **not** chained to `ci.yml` today — the central gap this change
  closes (`.github/workflows/deploy.yml:3-6`).
- The integration suite needs a real auth server (`setup.ts` hits `/auth/v1/health`),
  so a bare Postgres service container is insufficient — full `supabase start` is
  required (`src/test/integration/setup.ts:14-26`).
- Local Supabase keys are deterministic public dev values; `supabase status -o env`
  emits them, so **no GitHub secrets are needed for the integration job**.
- The unit suite is DB/network-free, so it can run in a fast job with no Docker
  (`vitest.config.ts:7`).

## What We're NOT Doing

- **Not** adding `npm run typecheck` (`astro check`) to CI. §5 already marks
  lint+typecheck as "already wired"; expanding the typecheck story is out of scope
  for this test-wiring phase. (Noted as a possible follow-up.)
- **Not** changing any test code, fixture, or vitest config — suites run as-is.
- **Not** introducing a hosted/remote Supabase test project — CI stands up Supabase
  in-runner per the decision.
- **Not** writing new application features or migrations.
- **Not** adding caching/matrix/parallelism optimizations beyond the two-job split.
- **Not** authoring multi-environment (staging) pipelines.

## Implementation Approach

Three sequential phases, each independently verifiable:

1. **CI test jobs** — restructure `ci.yml` from one job into two: `unit`
   (lint + `npm test`, no Docker) and `integration` (`supabase start` →
   derive keys → `npm run test:integration`). Both must pass for CI to be green.
2. **Deploy gate** — flip `deploy.yml` from `on: push` to
   `on: workflow_run` of the CI workflow, guarded to fire only on
   `conclusion == success` and `head_branch == main`.
3. **Merge-path closure + docs** — document branch protection (manual step +
   `gh api` snippet + verification), then sync `test-plan.md` §5/§3.

## Critical Implementation Details

- **`supabase start` needs Docker** — present on `ubuntu-latest`. Use
  `supabase/setup-cli@v1` to install the CLI, then `supabase start`. Startup is
  ~1–2 min; that cost lives only in the `integration` job, leaving the `unit` job
  fast.
- **Key derivation ordering** — `.env.test` must be populated _after_
  `supabase start` (the keys don't exist before) and _before_ `npm run test:integration`
  (setup.ts reads them). `supabase status -o env` prints `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`-style vars; map them to the names
  the suite expects: `SUPABASE_URL`, `SUPABASE_KEY` (anon), `SUPABASE_SERVICE_ROLE_KEY`.
- **`workflow_run` evaluates the workflow file from the default branch** — once
  `deploy.yml` uses `workflow_run`, the _merged_ version on `main` is what governs
  future runs. Include an `if:` guard so forks/failed/non-main CI runs never deploy.
- **Double quotes / lint** — no new `.ts` in this change, but if any helper script
  is added, it must pass the existing Prettier/ESLint gate (lessons L-doublequotes).

## Phase 1: Wire test suites into CI as two jobs

### Overview

Replace the single `ci` job with two jobs so a failing unit or integration test
fails the CI workflow. Keep lint where it is; add the integration job that stands
up Supabase in-runner.

### Changes Required:

#### 1. Restructure the CI workflow into `unit` + `integration` jobs

**File**: `.github/workflows/ci.yml`

**Intent**: Split the existing single job so the cheap checks (lint + unit tests)
run fast and independently of the Supabase-backed integration job. Both jobs are
required; if either fails, the workflow fails. Preserve the existing trigger
(`push`/`pull_request` to `main`) and the existing lint step verbatim.

**Contract**:

- Workflow keeps `name: CI` (downstream `deploy.yml` `workflow_run` matches on this
  name — keep it stable).
- `unit` job: `checkout → setup-node 22 (cache npm) → npm ci → npx astro sync →
npm run lint → npm test`. No Docker, no Supabase, no secrets. (`build` is retained
  here or dropped per implementer judgement — it currently validates the build; keep
  it to preserve existing signal, with the same `SUPABASE_URL`/`SUPABASE_KEY` secret
  env it has today.)
- `integration` job: `checkout → setup-node 22 (cache npm) → npm ci →
install Supabase CLI (supabase/setup-cli@v1) → supabase start →
write .env.test from supabase status → npm run test:integration`.
- The `integration` job needs **no** GitHub secrets — all values come from
  `supabase status -o env`.

#### 2. Derive `.env.test` from the running local Supabase

**File**: `.github/workflows/ci.yml` (a step inside the `integration` job)

**Intent**: After `supabase start`, capture the emitted URL + anon + service-role
keys and write them into a project-root `.env.test` (and/or the job env) using the
exact variable names the suite reads, so `setup.ts` and the fixture find them.

**Contract**: A shell step that runs `supabase status -o env` (env-format output)
and produces `.env.test` containing:

```
SUPABASE_URL=<api url from status>
SUPABASE_KEY=<anon key from status>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from status>
```

Map status keys → suite names (status emits `ANON_KEY`/`SERVICE_ROLE_KEY`/`API_URL`
style names; the suite expects `SUPABASE_KEY` for the anon key). Migrations are
applied automatically by `supabase start`; no separate migrate step is required.

### Success Criteria:

#### Automated Verification:

- CI workflow YAML is valid and parses: push the branch and the run is created (no
  "invalid workflow file" error).
- `unit` job runs `npm test` and it passes on a green commit.
- `integration` job reaches `npm run test:integration` (Supabase health check in
  `setup.ts` passes — proves the stack is up and keys are correct) and the suite passes.
- A deliberately broken unit assertion makes the `unit` job — and the overall CI
  workflow — fail (proves the gate has teeth).

#### Manual Verification:

- Integration job logs show `supabase start` completing and migrations applied.
- `.env.test` is populated with the three expected vars (visible via a masked/echo
  step or by the suite not fast-failing on missing env).
- Total CI wall-clock is acceptable (unit job returns fast; integration job ~2–4 min).

**Implementation Note**: After Phase 1 automated verification passes, pause for
manual confirmation (observe one green run and one intentionally-red run) before
proceeding to Phase 2.

---

## Phase 2: Gate production deploy on green CI

### Overview

Make `deploy.yml` fire only after the CI workflow concludes successfully on `main`,
so no change reaches production with a failing test.

### Changes Required:

#### 1. Switch deploy trigger to `workflow_run`

**File**: `.github/workflows/deploy.yml`

**Intent**: Replace the direct `on: push: branches: [main]` trigger with a
`workflow_run` trigger keyed to the CI workflow completing, guarded so deploy only
runs when CI succeeded on `main`. The build + `wrangler-action` steps are unchanged.

**Contract**:

- `on: workflow_run: workflows: ["CI"]: types: [completed]`.
- The deploy job carries an `if:` guard:
  `github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main'`.
- Existing steps (checkout, setup-node, npm ci, astro sync, build, wrangler-action)
  and their secret env (`SUPABASE_URL`, `SUPABASE_KEY`, `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`) are retained as-is.
- `checkout` should pin to the CI run's commit
  (`ref: ${{ github.event.workflow_run.head_sha }}`) so the deployed artifact matches
  the tested commit.

### Success Criteria:

#### Automated Verification:

- `deploy.yml` parses (workflow appears in the Actions tab without error).
- On a green push to `main`, deploy starts only after CI concludes `success`.
- On a red push to `main` (a failing test), the deploy job is skipped (guard
  evaluates false) — no `wrangler deploy` runs.

#### Manual Verification:

- Actions tab shows Deploy triggered by the CI `workflow_run`, not by `push`.
- The deployed commit SHA matches the CI run's `head_sha`.
- A push to a non-`main` branch does not trigger a deploy.

**Implementation Note**: After Phase 2 automated verification passes, pause for
manual confirmation (observe the red-blocks-deploy and green-allows-deploy paths)
before proceeding to Phase 3.

---

## Phase 3: Close the merge path + sync test-plan docs

### Overview

Branch protection ensures a red PR cannot merge (the deploy gate alone leaves the PR
merge path open). Then update `test-plan.md` to reflect that the Phase 4 gates are
wired.

### Changes Required:

#### 1. Document branch protection on `main`

**File**: `context/changes/testing-quality-gates-wiring/plan.md` (this plan) and
the change's `change.md` notes — branch protection is a GitHub repo setting, not
repo code, so it is captured as a documented manual step with a CLI path.

**Intent**: Give the human an exact, verifiable way to require the CI checks before
a merge into `main`, executed once.

**Contract**: Document both paths:

- **UI**: Repo → Settings → Branches → add a branch protection rule for `main` →
  "Require status checks to pass before merging" → select the CI job checks
  (`unit`, `integration`).
- **CLI** (`gh`): a `gh api` call against
  `repos/{owner}/{repo}/branches/main/protection` setting
  `required_status_checks.contexts` to the CI check names.
- **Verification**: open a PR with a failing test and confirm the merge button is
  blocked ("Required statuses must pass"). This is a manual, human-run step.

#### 2. Sync `test-plan.md` quality-gate + rollout status

**File**: `context/foundation/test-plan.md`

**Intent**: Flip the §5 gate rows that were "required after §3 Phase 4" to reflect
that CI now enforces them, and mark §3 Phase 4 `complete`.

**Contract**:

- §5: update the "unit tests", "integration tests", "Finnhub fallback test", and
  "CI gate enforcement" rows so their "Required?" cells read as wired/enforced in CI
  (drop the "required after Phase 4" qualifier now that it is satisfied).
- §3 Phase 4 row: `Status` → `complete`.
- Header line (top of file): update the "Last updated" / phase-status note to
  "Phase 4 complete".

#### 3. Mark the change complete

**File**: `context/changes/testing-quality-gates-wiring/change.md`

**Intent**: Stamp the change as done.

**Contract**: `status: complete` (or the repo's terminal status convention) and
`updated: <today>`.

### Success Criteria:

#### Automated Verification:

- `test-plan.md` §3 Phase 4 row reads `complete`; no remaining "required after §3
  Phase 4" qualifier in §5.
- `change.md` front-matter status updated.

#### Manual Verification:

- Branch protection is active: a PR with a failing test shows a blocked merge button.
- Branch protection requires the `unit` and `integration` checks specifically.
- The test-plan header reflects Phase 4 completion.

**Implementation Note**: Branch protection (change #1) is a human-run repo-settings
action; confirm it manually before marking the change complete.

---

## Testing Strategy

This phase wires existing tests; it does not add new test code. "Testing" here means
proving the gate behaves correctly:

### Integration Tests:

- Red unit test → CI fails → PR merge blocked → no deploy. (End-to-end gate proof.)
- Green commit → CI passes → deploy fires after CI success on the tested SHA.

### Manual Testing Steps:

1. Branch off `main`, break one assertion in a unit test, open a PR. Confirm CI's
   `unit` job fails and the PR merge button is blocked.
2. Confirm no Deploy run is triggered for that red commit.
3. Revert the break, confirm CI goes green, the PR can merge, and Deploy runs after
   CI success against the merge commit.
4. Confirm a push to a feature branch does not deploy.

## Performance Considerations

- The `unit` job has no Docker and returns in well under a minute — fast PR feedback.
- The `integration` job pays ~1–2 min for `supabase start`; isolating it keeps that
  cost off the fast path. Acceptable for an MVP gate; revisit caching only if the
  integration job becomes a bottleneck.

## Migration Notes

- Once `deploy.yml` uses `workflow_run`, the governing copy is the one on `main` —
  the change only takes full effect after it merges. Verify the gate on the _next_
  push after merge.
- No data migration; no rollback complexity beyond reverting the two workflow files.

## References

- Test plan: `context/foundation/test-plan.md` (§3 Phase 4, §5 quality gates)
- Change brief: `context/changes/testing-quality-gates-wiring/change.md`
- Lessons: `context/foundation/lessons.md` (L-husky CI gates, L-doublequotes,
  L2 Cloudflare Git Integration must stay disconnected when Actions owns deploy)
- Current CI: `.github/workflows/ci.yml`; current deploy: `.github/workflows/deploy.yml`
- Integration harness: `vitest.integration.config.ts`, `src/test/integration/setup.ts`,
  `src/test/integration/helpers/users.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Wire test suites into CI as two jobs

#### Automated

- [x] 1.1 CI workflow YAML valid — run is created without "invalid workflow file" — e452ae9
- [x] 1.2 `unit` job runs `npm test` and passes on a green commit — e452ae9
- [x] 1.3 `integration` job reaches and passes `npm run test:integration` (Supabase health check OK) — e452ae9
- [x] 1.4 A broken unit assertion fails the `unit` job and the overall CI workflow — e452ae9

#### Manual

- [x] 1.5 Integration logs show `supabase start` + migrations applied — e452ae9
- [x] 1.6 `.env.test` populated with the three expected vars — e452ae9
- [x] 1.7 Total CI wall-clock acceptable (unit fast; integration ~2–4 min) — e452ae9

### Phase 2: Gate production deploy on green CI

#### Automated

- [x] 2.1 `deploy.yml` parses and appears in the Actions tab — 7e6148f
- [x] 2.2 Green push to `main` → deploy starts only after CI concludes `success` — 7e6148f
- [x] 2.3 Red push to `main` → deploy job skipped (no `wrangler deploy`) — 7e6148f

#### Manual

- [x] 2.4 Deploy is triggered by CI `workflow_run`, not by `push` — 7e6148f
- [x] 2.5 Deployed commit SHA matches CI run `head_sha` — 7e6148f
- [x] 2.6 Non-`main` branch push does not trigger a deploy — 7e6148f

### Phase 3: Close the merge path + sync test-plan docs

#### Automated

- [x] 3.1 `test-plan.md` §3 Phase 4 reads `complete`; §5 "required after Phase 4" qualifiers removed — 67d3abc
- [x] 3.2 `change.md` front-matter status updated — 67d3abc

#### Manual

- [x] 3.3 Branch protection active — PR with a failing test shows blocked merge button — 67d3abc
- [x] 3.4 Branch protection requires the `unit` and `integration` checks specifically — 67d3abc
- [x] 3.5 Test-plan header reflects Phase 4 completion — 67d3abc
