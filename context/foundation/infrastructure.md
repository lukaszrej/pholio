---
project: Pholio
researched_at: 2026-05-27
recommended_platform: Cloudflare Workers (with static assets)
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 + React 19
  runtime: Cloudflare Workers (workerd / edge)
  database: Supabase (PostgreSQL)
  adapter: "@astrojs/cloudflare v13+"
---

## Recommendation

**Deploy on Cloudflare Workers with static assets.**

Cloudflare Workers is the only platform in the candidate pool that scores Pass on all five agent-friendly criteria and costs $0 at the expected MVP traffic volume (100k requests/day free — roughly 30× the projected load). The tech stack's existing `@astrojs/cloudflare` adapter, the first-class `wrangler` CLI, and Cloudflare's 16+ MCP servers with dedicated Claude Code integration make this the lowest-friction path from code to production and from production back to the agent. The "minimize cost" and "co-location preferred" interview answers further reinforce this choice: Cloudflare's KV, R2, and Queues complement Supabase without replacing it, all on the same vendor account.

**Critical correction to `tech-stack.md`:** `deployment_target: cloudflare-pages` is stale. The `@astrojs/cloudflare` v13 adapter dropped Cloudflare Pages support. The correct target is **Cloudflare Workers with static assets**, deployed via `wrangler deploy`. Attempting to use the Pages dashboard or Pages-specific docs will produce build failures.

## Platform Comparison

| Platform               | CLI-first  | Managed/Serverless | Agent docs | Deploy API | MCP        | Score     | Cost @ MVP                         |
| ---------------------- | ---------- | ------------------ | ---------- | ---------- | ---------- | --------- | ---------------------------------- |
| **Cloudflare Workers** | ✅ Pass    | ✅ Pass            | ✅ Pass    | ✅ Pass    | ✅ Pass    | **5/5**   | **$0**                             |
| **Vercel**             | ✅ Pass    | ✅ Pass            | ✅ Pass    | ✅ Pass    | ✅ Pass    | **5/5**   | $0 Hobby / $20/mo Pro (commercial) |
| **Netlify**            | 🟡 Partial | ✅ Pass            | ✅ Pass    | 🟡 Partial | ✅ Pass    | **3.5/5** | ~$0 (volatile pricing)             |
| **Railway**            | 🟡 Partial | ✅ Pass            | ✅ Pass    | 🟡 Partial | ✅ Pass    | **3.5/5** | $5–10/mo (no ceiling)              |
| **Render**             | 🟡 Partial | ✅ Pass            | ✅ Pass    | 🟡 Partial | ✅ Pass    | **3.5/5** | $7/mo always-on                    |
| **Fly.io**             | ✅ Pass    | 🟡 Partial         | 🟡 Partial | 🟡 Partial | 🟡 Partial | **2.5/5** | $5–8/mo minimum                    |

**Criteria scoring notes:**

- **Netlify / Railway / Render Partial on CLI-first and Deploy API:** All three lack a `rollback` CLI verb — rollback requires the dashboard or a raw REST API call, which an agent cannot perform without scripting the endpoint manually.
- **Fly.io Partial on Managed/Serverless:** Docker-first deployment adds real operational surface (Dockerfile maintenance, image registry management, machine sizing). Not appropriate for solo MVP scope.
- **Fly.io Partial on Agent docs:** No `llms.txt`; docs live as raw markdown on GitHub, accessible but not explicitly published for LLM consumption.
- **Fly.io Partial on MCP:** `fly mcp server` is bundled into the CLI but flagged **experimental** as of 2026-05-27.

**Interview weights applied:**

- _Minimize cost_ → Cloudflare ($0) strongly preferred; Railway/Render/Fly.io penalized (mandatory spend); Vercel penalized ($20/mo on commercial use).
- _Single region_ → No material differentiation.
- _No platform familiarity_ → No tie-breaker applied.
- _Co-location preferred_ → Cloudflare wins: KV, R2, Queues, and D1 are available as Supabase complements on the same vendor account.

### Shortlisted Platforms

#### 1. Cloudflare Workers — Recommended

Perfect 5/5 score across all criteria. Zero cost at MVP scale. `wrangler deploy` / `wrangler rollback` / `wrangler tail` cover the full operational loop without a browser. Docs are agent-readable via `Accept: text/markdown` header negotiation and `llms.txt`. Sixteen MCP servers plus a dedicated Claude Code integration page at `developers.cloudflare.com/agent-setup/claude-code/`. Cloudflare KV, R2, and Queues complement Supabase on the same vendor account. The `@astrojs/cloudflare` v13 adapter with `nodejs_compat` is the authoritative Astro 6 deploy path on this platform (targeting Workers with static assets, not Pages).

#### 2. Vercel

Also 5/5 on all criteria. Best developer experience of any platform in the pool. `vercel` CLI is intuitive; `llms-full.txt` is the richest agent-readable doc set available. Loses the top spot on two grounds: (1) Hobby ToS prohibits commercial use — any revenue forces a $20/month Pro upgrade with no intermediate tier; (2) deploying this stack requires swapping `@astrojs/cloudflare` for `@astrojs/vercel`, adding migration cost. Runtime log retention on Hobby (1 hour) is a security gap for post-incident review.

#### 3. Netlify

Free at this traffic level (20 of 300 monthly credits consumed). Official MCP server GA since June 2025. Loses to Vercel on two operational gaps: no `netlify rollback` CLI verb (dashboard or raw REST API required), and `import.meta.env` build-time inlining risks exposing Supabase keys in client bundles if not explicitly migrated to `process.env`. Pricing model instability (revised twice in eight months) reduces confidence in long-term cost projections.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **`deployment_target: cloudflare-pages` in tech-stack.md points to the wrong deploy target.** The `@astrojs/cloudflare` v13 adapter dropped Pages support. Deploying to Cloudflare Pages via the dashboard or legacy Pages docs produces build failures. The correct path is Workers with static assets via `wrangler deploy`. This must be corrected before any deploy attempt.

2. **Free tier's 10ms CPU cap will trigger on the portfolio SSR page.** Verifying a Supabase JWT, querying 10–20 portfolio rows, and rendering the Astro page server-side takes 15–40ms of CPU. The fix is Workers Standard at $5/month, but this is a non-obvious surprise cost that appears after the "free" deploy is already live.

3. **No CommonJS in `workerd` — npm dependencies that ship CJS-only break at build time.** Any stock-price API SDK, charting library, or auth utility that doesn't ship ESM produces a cryptic Vite/Rollup error. Diagnosing the offending package and patching with a `vite.ssr.external` override can take hours mid-sprint.

4. **`nodejs_compat` flag and `compatibility_date` are required but easy to misconfigure.** Without the correct values in `wrangler.toml`, `node:crypto` (used by the Supabase auth client) fails silently in production. The error doesn't reproduce locally unless the Cloudflare Vite plugin is running.

5. **`wrangler rollback` targets the Worker script, not a snapshot of static assets.** In a narrow window between static asset upload and Worker registration, a rollback could produce a version mismatch between HTML and JS bundles — rare in practice but not impossible during overlapping deploys.

### Pre-mortem — How This Could Fail

_Six months in, Pholio is struggling on Cloudflare Workers._ The initial deploy worked — `wrangler deploy` completed in under two minutes. But within the first two weeks, users started reporting occasional `Worker exceeded CPU time limit` errors on the portfolio view. The Supabase JWT verification + table query + React SSR was tipping over the 10ms free-tier CPU cap on anything above a trivial page. The upgrade to Workers Standard ($5/mo) fixed it, but it was a surprise. Then the external stock-price API the team chose shipped a CJS-only SDK. Three days were lost debugging a Vite externalize error that only appeared in Wrangler's build pipeline, not in local Node.js dev. The Supabase client had been instantiated at module scope — a common Node.js pattern that silently leaks auth session state between requests in Workers' isolate model. Fixing it required refactoring every SSR endpoint. By month three, the `vite.config.ts` had accumulated a list of `ssr.external` overrides that no one fully understood. The `nodejs_compat` flag had been set with a compatibility date three months older than required, causing intermittent `crypto.randomUUID` failures that only appeared under production load. Total developer time lost to platform-specific friction: ~60 hours — roughly half the entire MVP budget.

### Unknown Unknowns

- **Supabase client must be instantiated per-request, not at module scope.** Workers share module-scope state across requests within the same isolate. A `createClient()` call at the top of a file leaks the authenticated session from user A to user B's request. Every SSR route must create a fresh client from the incoming request's cookies. Supabase documents this for Workers, but it is not obvious from their general SSR guides.
- **`wrangler dev` runs `workerd`, not Node.js.** Local development uses Cloudflare's edge runtime emulator. This is an advantage (CJS issues surface locally, not in production) but means `npm run dev` no longer behaves like a standard Node.js server. Hot reload, environment variable injection, and error messages all differ.
- **`wrangler secret` and `wrangler.toml` `[vars]` serve different purposes.** Non-secret values go in `wrangler.toml` `[vars]` and are visible in the Cloudflare dashboard. Secrets (Supabase anon key, JWT secret) must be set via `wrangler secret put` — encrypted and not readable after upload. Mixing the two puts secrets in plaintext in the repository.
- **Cloudflare Workers cannot read files from disk at runtime.** There is no filesystem in `workerd`. Any code that reads from `public/` at runtime or uses `import.meta.glob` for dynamic file loading must use Cloudflare static asset bindings instead.
- **The free plan CPU budget is per-invocation, not per-month.** 100k requests/day sounds generous, but each request also has a 10ms CPU cap — a separate, independent constraint. An app within the request limit can still hit CPU errors on every single request.

**Decision recorded:** Proceed with Cloudflare Workers — risks absorbed into risk register below.

## Operational Story

- **Preview deploys:** Every `wrangler deploy` to a non-production environment creates a unique `*.workers.dev` preview URL. Branch-based preview deploys require setting up Cloudflare's GitHub integration in the Workers dashboard; the `wrangler deploy --env staging` pattern works for named environments defined in `wrangler.toml`. Preview URLs are publicly accessible by default — add Cloudflare Access (free tier available) to require authentication on staging URLs.
- **Secrets:** Production secrets (Supabase URL, anon key, JWT secret) are set via `wrangler secret put KEY` and stored encrypted in Cloudflare's secret store — they are not readable after upload, not visible in `wrangler.toml`, and not echoed in `wrangler tail` output. Non-secret config (e.g. `PUBLIC_ENV=production`) lives in `wrangler.toml` `[vars]`. Rotation: `wrangler secret put KEY` with the new value; the Worker picks it up on the next request without a redeploy.
- **Rollback:** `wrangler rollback [VERSION_ID]` immediately promotes a prior Worker version to active across all routes — no redeploy needed, takes effect within seconds. `wrangler deployments list` shows version history. Static asset rollback follows the Worker version; there is a narrow window of potential mismatch during an in-flight rollback, so time rollbacks to off-peak if possible.
- **Approval:** Deploying to production (`wrangler deploy`), rotating secrets (`wrangler secret put`), and deleting a Worker (`wrangler delete`) are agent-permissible via scoped API tokens. Dropping the Supabase database, rotating the Supabase service-role key, and modifying DNS records are human-only panel operations — the Cloudflare API token issued to the agent must not have DNS or billing permissions.
- **Logs:** `wrangler tail [WORKER_NAME] --status error --format json` streams live runtime logs read-only. Filter by status, IP, or search string. High-traffic Workers enter sampling mode — add `--status error` to ensure all error events are captured. Historical logs beyond the live tail window require Cloudflare Logpush (paid) or the Observability MCP server.

## Risk Register

| Risk                                                                         | Source           | Likelihood | Impact | Mitigation                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ---------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deployment_target: cloudflare-pages` in tech-stack.md causes deploy failure | Research finding | High       | High   | Update `tech-stack.md` to `cloudflare-workers` before first deploy; use `wrangler deploy`, not the Pages dashboard                                                                  |
| Free-tier 10ms CPU cap triggers on portfolio SSR page                        | Devil's advocate | High       | Medium | Upgrade to Workers Standard ($5/mo) at first CPU error; budget this from day one                                                                                                    |
| CJS-only npm dependency breaks Wrangler build                                | Devil's advocate | Medium     | Medium | Audit new dependencies for ESM support before adding; add `ssr.external` override in `vite.config.ts` as fallback                                                                   |
| `nodejs_compat` flag misconfigured — `node:crypto` fails silently            | Devil's advocate | Medium     | High   | Pin exact `compatibility_flags = ["nodejs_compat"]` and `compatibility_date = "2024-09-23"` in `wrangler.toml`; validate locally with `wrangler dev` before first production deploy |
| Supabase client at module scope leaks auth session across requests           | Unknown unknowns | High       | High   | Instantiate `createClient()` inside the request handler using cookies from the incoming request; enforce via code review or linting rule                                            |
| Secret committed to repo via `wrangler.toml` `[vars]`                        | Unknown unknowns | Medium     | High   | All credentials go through `wrangler secret put` only; `[vars]` is for non-secret config; add a pre-commit hook to scan for known secret patterns                                   |
| Runtime log retention window too short for security review                   | Research finding | Low        | Medium | Enable Cloudflare Logpush to R2 for persistent log archive if compliance or forensics become a requirement                                                                          |
| Static asset / Worker version mismatch during rollback                       | Devil's advocate | Low        | Low    | Time rollbacks to off-peak; validate with a smoke test URL immediately after rollback completes                                                                                     |
| `workerd` runtime behavior differs from local Node.js dev                    | Unknown unknowns | Medium     | Medium | Always run `wrangler dev` (not `node`) for local SSR development; CI must run `wrangler deploy --dry-run` before merging to catch runtime incompatibilities                         |
| Supabase anon key exposed in client bundle via `import.meta.env`             | Pre-mortem       | Low        | High   | Use `process.env` for all Supabase credentials in server-side code; audit with `grep -r "import.meta.env" src/` before deploy                                                       |

## Getting Started

1. **Install and authenticate Wrangler:**

   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. **Verify `wrangler.toml` targets Workers (not Pages) with correct compat flags:**

   ```toml
   name = "pholio"
   compatibility_date = "2024-09-23"
   compatibility_flags = ["nodejs_compat"]

   [assets]
   directory = "./dist/client"
   ```

3. **Set production secrets (never in `wrangler.toml`):**

   ```bash
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_ANON_KEY
   wrangler secret put SUPABASE_JWT_SECRET
   ```

4. **Build and deploy:**

   ```bash
   npm run build
   wrangler deploy
   ```

5. **Verify live and tail logs:**
   ```bash
   wrangler deployments list
   wrangler tail pholio --status error --format json
   ```

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup (GitHub Actions deploy workflow)
- Production-scale architecture (multi-region, HA, DR)
- Cloudflare Access configuration for preview URL protection
- Logpush setup for persistent log archiving
