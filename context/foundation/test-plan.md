# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-14 (Phase 1 complete; Phase 2 → change opened)

---

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic assertion that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/` (excluding
`node_modules`, `dist`, `.astro`, `public`).

---

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                     | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Position aggregation returns wrong weighted-average cost or ROI — user sees incorrect profit/loss for any portfolio position                                | High   | High       | PRD Guardrail §ROI ("błąd matematyczny jest gorszy niż brak funkcji"); interview Q1; hot-spot dir `src/components/transactions/` 39 commits/30d; `src/lib/` 24 commits/30d    |
| 2   | Cross-user read: authenticated User A retrieves User B's transactions or portfolio via the API (RLS gap or service-role key misuse)                         | High   | Medium     | PRD §AC ("absolutnie niedostępne"); lessons.md (RLS WITH CHECK was initially missing from prices migration — precedent for policy gap); `supabase/migrations/` 10 commits/30d |
| 3   | Unauthenticated request to `/api/transactions` or `/api/portfolios` succeeds — data returned or state mutated without a session                             | High   | Medium     | PRD §AC; AGENTS.md "Protected routes" hard rule; `src/middleware.ts` 7 commits/30d                                                                                            |
| 4   | IDOR on transaction write: User A sends PATCH or DELETE to `/api/transactions/[id]` with User B's ID and the operation succeeds                             | High   | Medium     | PRD §AC; archived `2026-06-10-transaction-crud` (no explicit IDOR test in plan); `src/pages/api/transactions/` 9 commits/30d                                                  |
| 5   | Finnhub outage: dashboard crashes or shows zero/stale price without the required fallback indicator ("brak danych" or ⚠ with cached price)                  | High   | Medium     | PRD Guardrail §API availability ("bez crasha"); interview Q1; archived `2026-06-09-portfolio-roi-view` (fallback path explicitly called out in plan)                          |
| 6   | Finnhub returns `{c: 0}` (invalid ticker or no market data) — zero price written to cache — user sees $0 current price and wildly wrong ROI with no warning | Medium | Medium     | Archived `2026-06-09-portfolio-roi-view` ("`c === 0` guard" flagged as critical implementation detail); `src/lib/` hot-spot 24 commits/30d                                    |

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                       | Must challenge                                                                                                                                           | Context `/10x-research` must ground                                                                                                          | Likely cheapest layer                                | Anti-pattern to avoid                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| #1   | `computePositions()` produces correct weighted-avg cost and ROI for: single purchase, multi-purchase same ticker at different prices, mixed-currency position (must show N/A, not a wrong number) | "Function returns a number" ≠ "number is correct" — test oracle must be hand-calculated, not derived by running the production code                      | Input/output shape of the position-aggregation function; weighted-average formula; currency-skip logic; where the ROI formula is applied     | Unit (pure function, no DB/network needed)           | Oracle problem: asserting expected values copied from running the production function, which green-lights current bugs                  |
| #2   | User A's authenticated session querying `/api/transactions` or `/api/portfolios/[id]` returns zero rows from User B; direct Supabase query under User A's session cannot read User B's data       | "RLS is enabled" ≠ "all policies are complete (USING + WITH CHECK on every operation)" — lessons.md shows this was once missing                          | RLS policies on `transactions` and `prices` tables; whether the API Supabase client uses the user session (anon key) or the service role key | Integration (two test users, real Supabase project)  | Testing only the positive case (User A sees their own data); the negative assertion — User A cannot see User B's data — is load-bearing |
| #3   | GET/POST to `/api/transactions` or `/api/portfolios` without a session cookie returns 401 or 403, not data                                                                                        | "Middleware protects `/dashboard`" ≠ "`/api/` routes are also guarded" — they may need separate entries in `PROTECTED_ROUTES`                            | `PROTECTED_ROUTES` list in middleware; whether each API route independently checks for a valid session before any DB call                    | Integration (unauthenticated HTTP request)           | Assuming page-level middleware protection implies equivalent API route protection                                                       |
| #4   | PATCH/DELETE to `/api/transactions/[id]` using User B's resource ID returns 404 or 403; User B's row is unchanged after the call                                                                  | "RLS UPDATE is enabled" ≠ "policy has both USING and WITH CHECK" — lessons.md records this was once missing on the prices migration                      | RLS UPDATE and DELETE policies on `transactions`; presence of WITH CHECK clause; whether the API validates ownership independently of RLS    | Integration (two test users, real Supabase project)  | Testing only the happy path (User A updating their own transaction)                                                                     |
| #5   | When Finnhub HTTP call times out or returns 5xx, the dashboard renders with the last cached price and a ⚠ indicator; when no cache exists, "brak danych" is shown without throwing                | "Fallback code exists in the plan" ≠ "fallback actually fires when Finnhub is slow or down" — AbortController timeout must trigger under test conditions | Where the Finnhub call occurs in the server render path; AbortController/timeout setup; how the fallback cascades to the UI render           | Integration (mock Finnhub HTTP, real Supabase cache) | Only testing the happy path (successful Finnhub response)                                                                               |
| #6   | When Finnhub returns `{c: 0}`, no price is written to the cache; the affected position shows "brak danych"; any previously cached price for the ticker is preserved                               | "The guard was in the implementation plan" ≠ "the guard survived subsequent refactors to the fetch/cache logic"                                          | `fetchQuote()` implementation: where the `c === 0` check lives, return value when null, how the caller handles a null result                 | Unit (mock `fetch`, no DB needed)                    | Only testing valid-ticker responses where `c > 0`                                                                                       |

---

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                     | Goal (one line)                                                                           | Risks covered | Test types                                  | Status        | Change folder                                     |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------- | ------------- | ------------------------------------------- | ------------- | ------------------------------------------------- |
| 1   | Business logic unit suite      | Prove ROI aggregation and zero-price guard are correct at the cheapest layer              | #1, #6        | Unit (Vitest)                               | complete      | context/changes/testing-business-logic-unit-suite |
| 2   | API security integration tests | Prove users can only read and write their own data; unauthenticated requests are rejected | #2, #3, #4    | Integration (real Supabase, two test users) | change opened | context/changes/testing-api-security-integration  |
| 3   | External dependency resilience | Prove Finnhub outage neither crashes the dashboard nor silently misleads the user         | #5            | Integration (mock Finnhub HTTP, real cache) | not started   | —                                                 |
| 4   | Quality gates wiring           | Wire Vitest into CI so no change reaches production with a failing test                   | all           | CI config (GitHub Actions)                  | not started   | —                                                 |

---

## 4. Stack

| Layer             | Tool                                             | Notes                                                                                                                                        |
| ----------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit              | Vitest ≥ 4.1                                     | Pure-function tests (e.g. position aggregation, price guard); no Workers runtime needed                                                      |
| Integration       | Vitest ≥ 4.1 + `@cloudflare/vitest-pool-workers` | Runs tests inside the Workers runtime via Miniflare; reads bindings from `wrangler.jsonc` via `cloudflareTest({ wrangler: { configPath } })` |
| HTTP mocking      | `undici` MockAgent                               | Available inside the Workers runtime via `nodejs_compat`; intercepts outbound Finnhub calls                                                  |
| Supabase test env | Local `supabase start` or separate test project  | Required for Phase 2 (two-user RLS scenarios); research must confirm preferred setup                                                         |
| e2e               | none yet — not in scope for this rollout         | Add if a future risk requires full browser context                                                                                           |

**Stack grounding tools (current session):**

- Docs: none — no Context7 or framework docs MCP available; checked: 2026-06-14
- Search: Exa.ai — verified `@cloudflare/vitest-pool-workers` requires Vitest ≥ 4.1, uses `cloudflareTest()` plugin, reads `wrangler.jsonc` via `configPath`; checked: 2026-06-14
- Runtime/browser: no Playwright MCP available in session; not used
- Provider/platform: no GitHub, Cloudflare, or Supabase MCP available in session; not used

---

## 5. Quality Gates

| Gate                  | Where          | Required?                      | Catches                                                            |
| --------------------- | -------------- | ------------------------------ | ------------------------------------------------------------------ |
| lint + typecheck      | local + CI     | required (already wired in CI) | syntactic and type drift                                           |
| unit tests            | local + CI     | required after §3 Phase 1      | ROI computation regressions, price-guard regressions               |
| integration tests     | local + CI     | required after §3 Phase 2      | cross-user data access, unauthenticated API access, IDOR on writes |
| Finnhub fallback test | local + CI     | required after §3 Phase 3      | outage regressions in the price-fetch/cache path                   |
| CI gate enforcement   | GitHub Actions | required after §3 Phase 4      | prevents any of the above regressions from merging                 |

---

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test (pure function)

**Established by:** §3 Phase 1 (testing-business-logic-unit-suite)

**File location:** Colocated with the module under test — `src/lib/<module>.test.ts`. Do not create a separate `__tests__/` directory; tests live next to the source they cover.

**Naming convention:** `<module>.test.ts` — e.g. `src/lib/portfolio.test.ts`, `src/lib/finnhub.test.ts`.

**Run commands:**

- One-shot (CI-style): `npm test`
- Watch mode (local dev): `npm run test:watch`

**Reference tests:**

- Pure-function math (no mocking): `src/lib/portfolio.test.ts` — see `describe("computePositions")` for weighted-average oracle pattern and `describe("computePortfolioSummary")` for roll-up assertions.
- Fetch-edge with mocked `global.fetch`: `src/lib/finnhub.test.ts` — see `describe("fetchQuote")` for the `vi.fn()` / `beforeEach` / `afterEach` restore pattern.

**Virtual-module mocking (`astro:env/server`):** `src/lib/finnhub.ts` imports `FINNHUB_API_KEY` from the Astro virtual module `astro:env/server`. Plain Vitest cannot resolve this id. It is aliased in `vitest.config.ts` to the test stub at `src/test/stubs/astro-env-server.ts`, which exports a **mutable** `let FINNHUB_API_KEY`. Any new module that imports from `astro:env/server` is automatically covered by this alias — no per-test change needed. If you need to toggle the key within a test, import the stub directly and reassign the export; restore it in `afterEach`.

**`@` alias:** `vitest.config.ts` mirrors the `@/* → ./src/*` path alias from `tsconfig.json`. Import project modules with `@/lib/...` inside tests exactly as in production code.

**Oracle rule:** Never derive expected values by calling the function under test and snapshotting the result. Compute each expected number by hand (or write the arithmetic as a comment). A test whose oracle came from the implementation cannot catch a bug in that implementation.

### 6.2 Adding an integration test (API route or security scenario)

TBD — see §3 Phase 2. Will cover: Supabase test-user setup, how to
authenticate in tests, the two-user fixture pattern for IDOR scenarios,
and the run command.

### 6.3 Adding a test for an external-HTTP dependency (Finnhub pattern)

TBD — see §3 Phase 3. Will cover: how to intercept outbound HTTP via
undici MockAgent inside the Workers runtime, the fallback-path test pattern,
and the cache-preservation assertion pattern.

### 6.4 Adding a test for a new API endpoint

TBD — see §3 Phase 2. Will cover: the preferred test type (integration
over unit for API routes), the auth-header pattern, and the ownership-check
assertion pattern.

---

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Supabase auth internals** (signup flow, token exchange, session management) — that is Supabase's code, not ours; it is covered by Supabase's own test suite. Re-evaluate if we add a custom auth provider or override session handling. (Source: interview Q5.)
- **Admin UI** — small trusted audience, low blast radius, not worth the maintenance cost for MVP. Re-evaluate if the admin surface grows or handles user data mutations. (Source: interview Q5.)
- **UI layout / snapshot tests** — break on every Tailwind or component tweak and catch nothing functional. Deterministic assertions on computed values (ROI, prices) are preferred over visual snapshots. Re-evaluate only for a small set of critical rendered-output regressions, not page-level snapshots. (Source: interview Q5.)
- **Currency conversion** — FR-009 is parked in the roadmap; no conversion logic exists. (Source: roadmap §Parked.)
- **Broker import / CSV parsing** — explicit Non-Goal in PRD §Non-Goals for MVP. (Source: PRD.)

---

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-14
- Stack versions last verified: 2026-06-14
- AI-native tool references last verified: n/a — no AI-native layer in this rollout

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
