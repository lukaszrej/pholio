---
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
---

## Why this stack

Pholio is a solo-built, after-hours personal portfolio tracker with a 3-week MVP timeline. The 10x Astro Starter (Astro 6 + React 19 + TypeScript + Tailwind CSS 4 + Supabase + Cloudflare Pages) covers every hard requirement without extra integration work: Supabase's built-in auth satisfies FR-001–003 (email/password registration, login, logout), PostgreSQL handles the transaction data model, and Row Level Security enforces the "each user sees only their own data" privacy guardrail at the database level. Cloudflare Pages gives a free-tier edge deployment that pairs natively with the starter's @astrojs/cloudflare adapter. The TypeScript-first, Zod-at-boundaries discipline makes the codebase maximally agent-friendly for the build-out ahead.
