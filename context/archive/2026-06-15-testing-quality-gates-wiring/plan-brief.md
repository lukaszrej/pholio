# Quality Gates Wiring (CI enforcement) — Plan Brief

> Full plan: `context/changes/testing-quality-gates-wiring/plan.md`

## What & Why

Phases 1–3 of the test rollout landed unit + integration suites, but **nothing runs
them in CI** and **deploy fires on every push to `main` independently of CI**. So a
change with a failing test can reach production. This phase wires both suites into
GitHub Actions as hard-required gates, makes deploy wait for green CI, and adds
branch protection so a red PR can't merge.

## Starting Point

`ci.yml` runs lint + build only (no tests). `deploy.yml` runs build + Cloudflare
deploy on every push to `main`, with no dependency on CI. The unit suite is
DB/network-free; the integration suite needs a live Supabase (its `setup.ts` health-
checks `/auth/v1/health`) plus anon + service-role keys via `.env.test`.

## Desired End State

Push/PR to `main` runs lint + unit + integration; any test failure fails CI. The
Cloudflare deploy runs only after CI concludes `success` on `main` and against the
tested commit. A red PR cannot be merged. `test-plan.md` §5 gates read as wired and
§3 Phase 4 reads `complete`.

## Key Decisions Made

| Decision              | Choice                                           | Why (1 sentence)                                                               | Source |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ | ------ |
| Deploy gating         | Branch protection + gate deploy on CI            | Closes both the PR merge path and the direct-push deploy path.                 | Plan   |
| Supabase in CI        | `supabase start` in the runner                   | Hermetic, matches local dev, uses public local keys (no real secrets).         | Plan   |
| Job layout            | Separate `unit` + `integration` jobs in `ci.yml` | Fast unit feedback decoupled from the slow Supabase job.                       | Plan   |
| CI keys               | Derive from `supabase status -o env`             | Zero hardcoding, self-healing, no GitHub secrets needed for integration.       | Plan   |
| Deploy gate mechanism | `workflow_run` trigger on CI success             | Keeps CI/CD as separate workflows; deploy only after green CI; no duplication. | Plan   |
| Integration gate      | Hard gate — both jobs required                   | Integration covers Risks #2–#5; gating them is the point of the phase.         | Plan   |
| Branch protection     | Document as manual step + `gh api` snippet       | Honest that it's repo config; gives a verifiable copy-paste path.              | Plan   |

## Scope

**In scope:** Restructure `ci.yml` into `unit` + `integration` jobs; stand up
Supabase in the integration job; gate `deploy.yml` on CI via `workflow_run`; document
branch protection; sync `test-plan.md` §5/§3 and `change.md`.

**Out of scope:** Adding `astro check`/typecheck to CI; changing any test/fixture/
vitest config; remote Supabase test project; caching/matrix optimizations; multi-env
pipelines; new app features.

## Architecture / Approach

Two CI jobs: `unit` (lint + `npm test`, no Docker) and `integration`
(`supabase start` → write `.env.test` from `supabase status -o env` →
`npm run test:integration`). `deploy.yml` switches from `on: push` to
`on: workflow_run` of CI, guarded by `conclusion == success && head_branch == main`,
and checks out `workflow_run.head_sha`. Branch protection requires the `unit` and
`integration` checks before merge.

## Phases at a Glance

| Phase                           | What it delivers                                     | Key risk                                                   |
| ------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| 1. Wire test jobs into CI       | unit + integration suites run and gate every push/PR | Supabase-in-runner startup / key derivation correctness    |
| 2. Gate deploy on green CI      | deploy fires only after CI succeeds on `main`        | `workflow_run` guard semantics; only effective once merged |
| 3. Close merge path + sync docs | branch protection + test-plan/change.md updated      | Branch protection is a human-run repo setting, not code    |

**Prerequisites:** Existing CI/deploy workflows and secrets (`SUPABASE_*`,
`CLOUDFLARE_*`) already configured; `supabase/migrations/` present; repo admin
access for branch protection.
**Estimated effort:** ~1 session across 3 phases (mostly YAML + one manual repo setting).

## Open Risks & Assumptions

- `supabase status -o env` emits anon/service-role/URL in a parseable form mappable
  to `SUPABASE_KEY`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_URL`. Verify in the first run.
- `workflow_run` uses the `deploy.yml` on `main`, so the gate is fully effective only
  after this change merges — confirm on the next push.
- Integration-job flakiness (Docker/Supabase startup) can block a legitimate deploy;
  accepted as a hard gate (re-run on transient failure).
- Branch protection depends on the human running the documented `gh api`/UI step.

## Success Criteria (Summary)

- A failing test (unit or integration) fails CI, blocks the PR merge, and prevents deploy.
- A green commit deploys only after CI success, against the tested SHA.
- `test-plan.md` Phase 4 reads `complete` and §5 gates read as CI-enforced.
