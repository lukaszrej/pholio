---
change_id: testing-quality-gates-wiring
title: Wire CI quality gates for all test suites
status: archived
created: 2026-06-15
updated: 2026-06-17
archived_at: 2026-06-17T16:52:36Z
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md: "Quality gates wiring".
Risks covered: all (#1 ROI aggregation, #2 cross-user read, #3 unauthenticated API, #4 IDOR write, #5 Finnhub outage, #6 zero-price guard).
Test types planned: CI config (GitHub Actions).
Risk response intent:

- All risks: Wire the existing Vitest unit suite (npm test) and integration suite (npm run test:integration) into GitHub Actions CI so that every push/PR runs both suites and a failing test blocks the merge. The CI job must prove that no change reaches production with a failing test — which is currently unverified because phases 1–3 landed tests locally but no CI enforcement exists.

## Branch Protection — Manual Setup Required

Branch protection on `main` is a GitHub repo setting, not code. Enable it once via either path:

**UI:** Repo → Settings → Branches → Add branch protection rule → Branch name pattern: `main` → enable "Require status checks to pass before merging" → search for and select `unit` and `integration` → Save.

**CLI:**

```bash
gh api repos/lukaszrej/pholio/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["unit","integration"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews=null \
  --field restrictions=null
```

**Verification:** Open a PR with a failing unit assertion → confirm the merge button shows "Required statuses must pass before merging" and is blocked.
