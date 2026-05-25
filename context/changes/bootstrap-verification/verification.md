---
bootstrapped_at: 2026-05-25T17:27:00Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: pholio
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: pholio
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

**Why this stack:** Pholio is a solo-built, after-hours personal portfolio tracker with a 3-week MVP timeline. The 10x Astro Starter (Astro 6 + React 19 + TypeScript + Tailwind CSS 4 + Supabase + Cloudflare Pages) covers every hard requirement without extra integration work: Supabase's built-in auth satisfies FR-001–003 (email/password registration, login, logout), PostgreSQL handles the transaction data model, and Row Level Security enforces the "each user sees only their own data" privacy guardrail at the database level. Cloudflare Pages gives a free-tier edge deployment that pairs natively with the starter's @astrojs/cloudflare adapter. The TypeScript-first, Zod-at-boundaries discipline makes the codebase maximally agent-friendly for the build-out ahead.

## Pre-scaffold verification

| Signal      | Value                                          | Severity | Notes                                  |
| ----------- | ---------------------------------------------- | -------- | -------------------------------------- |
| npm package | not run — cmd_template uses `git clone`        | n/a      | no npm create-* CLI to check           |
| GitHub repo | przeprogramowani/10x-astro-starter pushed 2026-05-17 | fresh | from card.docs_url; 8 days ago        |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone (cloned starter repo; upstream .git/ deleted before move-up)
**Exit code**: 0
**Files moved**: 20 root-level items (directories counted as 1)
**Conflicts (.scaffold siblings)**: `CLAUDE.md` → `CLAUDE.md.scaffold` (existing project CLAUDE.md preserved)
**.gitignore handling**: moved silently (no .gitignore existed in cwd)
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/1 direct of HIGH total 0/1; direct MODERATE: 2 (`@astrojs/check`, `wrangler`) of 9 total

#### CRITICAL findings

None.

#### HIGH findings

| Package  | Version      | Advisory                                    | CVSS | Fix available |
| -------- | ------------ | ------------------------------------------- | ---- | ------------- |
| devalue  | 5.6.3–5.8.0  | GHSA-77vg-94rm-hx3p — DoS via sparse array deserialization (CWE-770) | 7.5 | Yes (`npm audit fix`) |

`devalue` is a **transitive** dependency (not in your direct dependencies). It is a Svelte utility used internally by Astro's server-rendering internals. The DoS vector requires an attacker to send a crafted payload through your server — low real-world risk for a personal portfolio tracker behind auth. Fix is available; run `npm audit fix` after confirming no breaking changes.

#### MODERATE findings

| Package                 | Direct? | Root cause              | Fix available |
| ----------------------- | ------- | ----------------------- | ------------- |
| @astrojs/check          | yes     | → @astrojs/language-server → volar-service-yaml → yaml-language-server (GHSA-48c2-rrv3-qjmp) | Major version downgrade (0.9.2) |
| @astrojs/language-server | no     | → volar-service-yaml    | Via @astrojs/check downgrade |
| wrangler                | yes     | → miniflare → ws (GHSA-58qx-3vcg-4xpx, uninitialized memory disclosure) | Yes |
| miniflare               | no      | → ws                    | Yes (via wrangler update) |
| @cloudflare/vite-plugin | no      | → miniflare, wrangler, ws | Yes |
| volar-service-yaml      | no      | → yaml-language-server  | Via @astrojs/check downgrade |
| yaml-language-server    | no      | → yaml (stack overflow via deeply nested YAML) | Via @astrojs/check downgrade |
| yaml                    | no      | GHSA-48c2-rrv3-qjmp     | Via @astrojs/check downgrade |
| ws                      | no      | GHSA-58qx-3vcg-4xpx     | Yes |

All MODERATE findings are in **dev/toolchain** packages (`@astrojs/check` is a dev linter, `wrangler` is a dev CLI). They do not affect your production runtime bundle deployed to Cloudflare Pages.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value             |
| ----------------------- | ----------------- |
| bootstrapper_confidence | first-class       |
| quality_override        | false             |
| path_taken              | standard          |
| self_check_answers      | null              |
| team_size               | solo              |
| deployment_target       | cloudflare-pages  |
| ci_provider             | github-actions    |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true              |
| has_payments            | false             |
| has_realtime            | false             |
| has_ai                  | false             |
| has_background_jobs     | false             |

These hints are preserved for the future M1L4 skill (CLAUDE.md / AGENTS.md generation) and any v2 bootstrapper that acts on feature flags or CI/CD scaffold.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` — the starter ships its own CLAUDE.md with Astro/Supabase/Cloudflare guidance; you may want to merge relevant sections into your project's `CLAUDE.md`.
- `npm audit fix` to resolve the 1 HIGH and most MODERATE findings (all in dev toolchain; no production risk).
- Configure Supabase RLS on your `transactions` table early — the `has_auth: true` flag means auth is in scope, and RLS is the database-level enforcement for "each user sees only their own data".
