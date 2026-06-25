# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-15 (Phase 4 complete — all gates wired in CI)

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

| #   | Phase name                     | Goal (one line)                                                                           | Risks covered | Test types                                  | Status   | Change folder                                          |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------- | ------------- | ------------------------------------------- | -------- | ------------------------------------------------------ |
| 1   | Business logic unit suite      | Prove ROI aggregation and zero-price guard are correct at the cheapest layer              | #1, #6        | Unit (Vitest)                               | complete | context/changes/testing-business-logic-unit-suite      |
| 2   | API security integration tests | Prove users can only read and write their own data; unauthenticated requests are rejected | #2, #3, #4    | Integration (real Supabase, two test users) | complete | context/changes/testing-api-security-integration       |
| 3   | External dependency resilience | Prove Finnhub outage neither crashes the dashboard nor silently misleads the user         | #5            | Integration (mock Finnhub HTTP, real cache) | complete | context/changes/testing-external-dependency-resilience |
| 4   | Quality gates wiring           | Wire Vitest into CI so no change reaches production with a failing test                   | all           | CI config (GitHub Actions)                  | complete | context/changes/testing-quality-gates-wiring           |

---

## 4. Stack

| Layer             | Tool                                     | Notes                                                                                                                                                                                                                      |
| ----------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit              | Vitest ≥ 4.1                             | Pure-function tests (e.g. position aggregation, price guard); no Workers runtime needed                                                                                                                                    |
| Integration       | Vitest ≥ 4.1 (plain Node env)            | Runs in Node via `vitest.integration.config.ts`; `.env.test` loaded via `loadEnv`; `@`/`astro:env/server`/`astro:middleware` aliases wired. `@cloudflare/vitest-pool-workers` was aspirational; Phase 2/3 uses plain Node. |
| HTTP mocking      | `vi.spyOn(global, "fetch")`              | Intercepts outbound Finnhub calls at the `global.fetch` boundary inside `fetchQuote`. `undici` MockAgent is not used — it requires the Workers runtime. Restore the spy in `afterEach` (see §6.3).                         |
| Supabase test env | Local `supabase start`                   | Required for Phase 2 (two-user RLS) and Phase 3 (single-row cache fallback). Use service-role client to seed/clean test rows.                                                                                              |
| e2e               | none yet — not in scope for this rollout | Add if a future risk requires full browser context                                                                                                                                                                         |

**Stack grounding tools (current session):**

- Docs: none — no Context7 or framework docs MCP available; checked: 2026-06-14
- Search: Exa.ai — verified `@cloudflare/vitest-pool-workers` requires Vitest ≥ 4.1, uses `cloudflareTest()` plugin, reads `wrangler.jsonc` via `configPath`; checked: 2026-06-14
- Runtime/browser: no Playwright MCP available in session; not used
- Provider/platform: no GitHub, Cloudflare, or Supabase MCP available in session; not used

---

## 5. Quality Gates

| Gate                  | Where          | Required?                                                                           | Catches                                                            |
| --------------------- | -------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| lint + typecheck      | local + CI     | required (already wired in CI)                                                      | syntactic and type drift                                           |
| unit tests            | local + CI     | required (wired in CI)                                                              | ROI computation regressions, price-guard regressions               |
| integration tests     | local + CI     | required (wired in CI)                                                              | cross-user data access, unauthenticated API access, IDOR on writes |
| Finnhub fallback test | local + CI     | required (wired in CI)                                                              | outage regressions in the price-fetch/cache path                   |
| CI gate enforcement   | GitHub Actions | required (active — `unit` + `integration` jobs enforce all suites on every push/PR) | prevents any of the above regressions from merging                 |

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

**Established by:** §3 Phase 2 (testing-api-security-integration)

**Prerequisite:** Local Supabase must be running (`supabase start`). The
integration suite will fast-fail with a clear message if it is not.

**File location:** `src/test/integration/*.integration.test.ts`. The
`integration` Vitest project picks up any file matching this glob; the `unit`
project excludes them. Never place integration files next to source modules.

**Naming convention:** `<scenario>.integration.test.ts` — e.g.
`rls-cross-user.integration.test.ts`, `idor-write.integration.test.ts`,
`unauthenticated-api.integration.test.ts`.

**Run command:** `npm run test:integration`

**Two-user fixture:** For any security or IDOR scenario import the fixture
helper from `src/test/integration/helpers/users.ts`. Call it in `beforeAll`
with the service-role client (from `process.env.SUPABASE_SERVICE_ROLE_KEY`,
available via `.env.test`). The helper creates and confirms two test users,
seeds one portfolio + one transaction each, returns an **anon-key** client
authenticated with each user's JWT, the seeded row ids, and a `teardown()`
function. Call `teardown()` in `afterAll`. The service-role key is used only
inside the fixture helper — every assertion must use the anon+JWT client, or
RLS is bypassed and the test proves nothing.

**Negative-assertion rule:** "User A sees their own rows" is never the
load-bearing check. The required assertion is "User A sees **zero** of User
B's rows." A direct `.eq("id", <User B's id>)` lookup under User A's client
must return an empty result set, not an error.

**IDOR oracle rule:** After User A's update/delete attempt, re-fetch User B's
row with **User B's client** and compare field-for-field against the
hand-known seeded value. Do not infer success from the write response alone.

**404 not 403:** RLS makes a foreign row invisible (returns 0 rows), which
maps to PGRST116 → HTTP 404 at the REST layer. Assertions should check for
zero affected rows at the DB layer, not a 403 status.

**Reference tests:**

- Cross-user read (Risk #2): `src/test/integration/rls-cross-user.integration.test.ts`
- IDOR write (Risk #4): `src/test/integration/idor-write.integration.test.ts` — covers transaction UPDATE, transaction DELETE, portfolio UPDATE, and portfolio DELETE.

### 6.3 Adding a test for an external-HTTP dependency (Finnhub pattern)

**Established by:** §3 Phase 3 (testing-external-dependency-resilience)

**Fallback signal:** The only machine-readable indicator of a Finnhub failure is
`is_fresh: false` on a returned price row, or the ticker being **absent** from
the result dict (no cached row). The ⚠ and "brak danych" wording in Risk #5 is
satisfied by the existing gray-text (`#93a1b5`) stale indicator and em-dash
no-price marker in the UI, backed by this data-layer signal. No explicit ⚠ icon
or literal string "brak danych" was added to the codebase.

#### Rule: split AbortController proof from integration fallback tests

- **Timeout / AbortController proof** → **unit test** (`src/lib/finnhub.test.ts`).
  Use `vi.useFakeTimers()` + a never-resolving `global.fetch` mock + `vi.advanceTimersByTimeAsync(2500)`.
  Do NOT mix fake timers with real Supabase I/O — fake `setTimeout` breaks
  Supabase's own retry logic.
- **Cache-fallback scenarios** → **integration test** (`src/test/integration/prices.integration.test.ts`).
  Mock `global.fetch` to return `{ ok: false }` (5xx) or `Promise.reject(...)` immediately —
  no timers needed; the failure is instant.

#### File locations

| Test type                    | File                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| Timeout proof (unit)         | `src/lib/finnhub.test.ts` — see `"AbortController fires at 2500ms"` case                                |
| Cache fallback (integration) | `src/test/integration/prices.integration.test.ts` — see `describe("Risk #5 — Finnhub outage fallback")` |

#### HTTP mock pattern (`vi.spyOn(global, "fetch")`)

`fetchQuote` calls `global.fetch` directly. Intercept it with `vi.spyOn`:

```typescript
const realFetch = global.fetch.bind(global);
let fetchSpy: MockInstance | undefined;

fetchSpy = vi.spyOn(global, "fetch").mockImplementation((url, opts) => {
  if (toUrlString(url).includes("finnhub.io")) {
    return Promise.resolve({ ok: false, status: 503 } as unknown as Response);
  }
  return realFetch(url, opts); // let Supabase calls through
});

// Restore in afterEach — a leaked spy poisons Supabase's own fetch calls
afterEach(() => {
  fetchSpy?.mockRestore();
  fetchSpy = undefined;
});
```

Do **not** use `undici` MockAgent — it requires the Workers runtime, which the
integration harness does not use (plain Node env, see §4).

#### Seeding the global `prices` table

The `prices` table has no `user_id` — one row per ticker. Use the service-role
admin client (same shape as `src/test/integration/helpers/users.ts:buildAdminClient`)
to seed and clean rows. Use a unique per-run ticker (e.g. `` `TST${Date.now()}` ``)
to avoid collisions across parallel runs.

```typescript
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// seed a stale row (fetched_at in the past so freshness short-circuit does not fire)
await admin.from("prices").insert({ ticker, price: 42.5, fetched_at: "2020-01-01T00:00:00.000Z" });

// clean up in afterEach and afterAll
await admin.from("prices").delete().eq("ticker", ticker);
```

#### Load-bearing assertions

Feed `refreshPricesForTickers` results through `computePositions` to assert the
full data-layer signal, not just the raw price dict:

- **Stale-cache fallback**: `result[ticker].is_fresh === false` + `result[ticker].price === seededPrice` + Supabase row unchanged (re-SELECT and compare). Then `computePositions(…).isFresh === false`, `currentPrice === seededPrice`.
- **No-cache fallback**: `result[ticker] === undefined` + no row written (re-SELECT returns null). Then `computePositions(…).currentPrice === null`, `isFresh === false`.
- **Happy-path / change_pct propagation** (case c in `prices.integration.test.ts`): mock Finnhub to return `{ c: price, dp: changePct }`, assert the upserted row has `change_pct` set, and that `computePositions(…).changePct` matches. Added during Phase 3 implementation to cover the `change_pct` field; was de-scoped from the original plan but retained for coverage value.

#### Run command

```
npm run test:integration
```

Local Supabase must be running (`supabase start`). The suite fast-fails with a
clear message if it is not.

### 6.4 Adding a test for a new API endpoint

**Established by:** §3 Phase 2 (testing-api-security-integration)

**Preferred test type:** Integration, not unit. API routes combine middleware,
Supabase RLS, and business logic. Unit tests that mock the DB bypass the very
layer where most API security failures occur.

**Auth guard pattern:** Prove the route rejects unauthenticated callers by
invoking `onRequest` from `src/middleware.ts` directly with a synthetic Astro
context — no running server or build needed. The helper at
`src/test/integration/helpers/middleware-context.ts` builds the synthetic
context and a `next` spy. Test at minimum: no Cookie → 401 JSON; garbage
Cookie → 401; `/api/auth/*` path → `next` IS called. Reference:
`src/test/integration/unauthenticated-api.integration.test.ts`.
Routes with middleware auth-guard coverage: `/api/portfolios`, `/api/portfolios/[id]` (PUT/DELETE), `/api/transactions`, `/api/watchlist/quotes`.

**Ownership / IDOR pattern:** Prove at the Supabase-client layer using the
two-user fixture (see §6.2). The negative assertion (User A cannot read or
mutate User B's row) is the load-bearing check. The oracle for write attempts
is User B's re-fetched row compared field-for-field to the seeded value.

**404 not 403:** RLS invisibility causes PGRST116 → HTTP 404, not 403.
Document this in any endpoint PR; do not write assertions expecting 403 for
cross-user writes.

**No `GET /api/transactions` endpoint exists** (as of Phase 2). Cross-user
read for transactions is tested at the Supabase-client layer only, not via an
HTTP surface. Update this entry when the endpoint is added.

**Run command:** `npm run test:integration`

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

- Strategy (§1–§5) last reviewed: 2026-06-15
- Stack versions last verified: 2026-06-15
- AI-native tool references last verified: n/a — no AI-native layer in this rollout

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
