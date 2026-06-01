# Pholio — First Cloudflare Workers Deploy

## Context

Pholio (Astro 6 + React 19 + Supabase + TypeScript) was bootstrapped with the 10x Astro Starter using `@astrojs/cloudflare` v13. Infrastructure research selected Cloudflare Workers as the deployment platform. This plan executes the first production deploy, wires Supabase credentials, and sets up GitHub Actions for auto-deploy on merge to `main`.

**Already in place:**
- `wrangler.jsonc` with `nodejs_compat` flag and `compatibility_date: 2026-05-08` ✅
- `@astrojs/cloudflare` v13.5.0 installed ✅
- Supabase `createServerClient` called per-request (not module scope) ✅
- Existing CI workflow at `.github/workflows/ci.yml`
- Supabase project exists with credentials ready

**Bugs fixed before deploying:**
1. `wrangler.jsonc` `name` updated `10x-astro-starter` → `pholio` ✅
2. `wrangler.jsonc` `main` kept as `@astrojs/cloudflare/entrypoints/server` — the adapter generates `dist/server/wrangler.json` at build time which wrangler uses as the redirected config; the `main` field must NOT be changed to `dist/_worker.js/index.js` (breaks build-time validation) ✅
3. `wrangler.jsonc` `assets.directory` corrected `./dist` → `./dist/client` — build outputs `dist/client/` for static assets; `./dist` would expose `dist/server/` chunks as public files ✅
4. `tech-stack.md` `deployment_target: cloudflare-pages` → `cloudflare-workers` ✅
5. `.github/workflows/ci.yml` branch `master` → `main` ✅
6. `.github/workflows/deploy.yml` created ✅

---

## Phase 0 — Prerequisites

> **Pre-configured ✅ — Wrangler CLI, Cloudflare account, Supabase cloud project, and GitHub repo are already in place. Items below are marked complete for reference.**

### 0.1 System requirements

- [x] **Node.js 22** — matches the CI workflow and `.nvmrc`. Verify:
  ```bash
  ! node -v   # should print v22.x.x
  ```
  Install via [nvm](https://github.com/nvm-sh/nvm): `nvm install 22 && nvm use 22`, or download from nodejs.org.

- [x] **npm 10+** — bundled with Node 22. Verify: `npm -v`

- [x] **Wrangler CLI** — already listed as a `devDependency` (`wrangler ^4.90.0`), so it is available via `npx wrangler`. No global install required, but you can add one for convenience:
  ```bash
  ! npm install -g wrangler   # optional — npx wrangler works without this
  ! wrangler --version        # should print 4.x.x
  ```

### 0.2 Cloudflare CLI authentication

Wrangler needs a Cloudflare account to deploy. There are two paths:

**Option A — Browser login (recommended for first-time setup):**
```bash
! wrangler login
```
This opens a browser window, you authorise the CLI, and a token is stored in `~/.wrangler/config/default.toml`. Required once per machine.

**Option B — API token (CI/CD and headless environments):**
1. Create a scoped token at: Cloudflare dashboard → Profile → API Tokens → Create Token → *Edit Cloudflare Workers* template
   - Permissions: `Workers Scripts:Edit`, `Workers Routes:Edit`
   - **Do not add DNS, Billing, or R2 scopes**
2. Export for local use:
   ```bash
   export CLOUDFLARE_API_TOKEN=<your-token>
   ```
   Or add to your `.env.local` (not committed). This env var is picked up automatically by `wrangler deploy`.

Confirm auth works:
```bash
! wrangler whoami
```
Expected output: `You are logged in with an API Token` or your account email.

- [x] Cloudflare account exists
- [x] Wrangler auth configured (browser login or API token)

### 0.3 Supabase CLI authentication

The Supabase CLI is used for local migrations and schema management. It is already in `devDependencies` (`supabase ^2.23.4`).

- [x] Log in to Supabase CLI:
  ```bash
  ! npx supabase login
  ```
  This opens a browser and stores an access token in `~/.supabase/access-token`.

- [x] Verify access to your project:
  ```bash
  ! npx supabase projects list
  ```
  Find your project's **Reference ID** (format: `abcdefghijklmnop`) — you'll need it when linking the local repo.

- [x] Link the local repo to your Supabase project:
  ```bash
  ! npx supabase link --project-ref <your-ref-id>
  ```
  This creates `.supabase/` config. The `db password` prompt asks for your Supabase database password (found in Project Settings → Database → Connection string section).

### 0.4 Local environment variables

The build requires `SUPABASE_URL` and `SUPABASE_KEY` at compile time (Astro's `envField` schema). Set them locally:

- [x] Copy the example file:
  ```bash
  cp .env.example .env
  ```
- [x] Fill in `.env` with values from Supabase dashboard → Project Settings → API:
  ```
  SUPABASE_URL=https://<ref>.supabase.co
  SUPABASE_KEY=<anon-key>
  ```
  `.env` is in `.gitignore` — never commit it.

- [x] Verify local dev starts without errors:
  ```bash
  ! npm run dev
  ```
  The app should start at `http://localhost:4321`. Confirm the `/auth/signin` page loads.

### 0.5 Confirm Supabase project is reachable

- [x] In Supabase dashboard → Project Settings → API, note:
  - **Project URL** (`https://<ref>.supabase.co`)
  - **anon public** key (starts with `eyJ`)
- [x] Confirm the auth service is active: Dashboard → Authentication → Users (page loads without error)
- [x] Note the **database password** (used in `supabase link` above and for direct DB access if needed)

---

## Phase 1 — Pre-flight fixes

> **Agent-owned. No human input needed.**

- [x] **1.1** `wrangler.jsonc` — update `name` to `pholio`, update `main` to `dist/_worker.js/index.js`

  ```jsonc
  {
    "$schema": "node_modules/wrangler/config-schema.json",
    "name": "pholio",
    "main": "dist/_worker.js/index.js",
    "compatibility_date": "2026-05-08",
    "compatibility_flags": ["nodejs_compat"],
    "assets": {
      "binding": "ASSETS",
      "directory": "./dist",
      "not_found_handling": "404-page",
    },
    "observability": {
      "enabled": true,
    },
  }
  ```

  > **Why `dist/_worker.js/index.js`:** After `npm run build`, the Astro Cloudflare adapter compiles the SSR server into `dist/_worker.js/index.js`. The `@astrojs/cloudflare/entrypoints/server` reference in the starter is a dev-mode shim; using it for `wrangler deploy` would bundle the adapter source rather than the optimised build output. `dist/_worker.js/` is automatically excluded from static asset serving by the Cloudflare runtime — no `.assetsignore` is needed.

- [x] **1.2** `context/foundation/tech-stack.md` — change `deployment_target: cloudflare-pages` → `deployment_target: cloudflare-workers`

- [x] **1.3** `.github/workflows/ci.yml` — change both `push.branches` and `pull_request.branches` from `[master]` to `[main]`

- [x] **1.4** Create `.github/workflows/deploy.yml` — CD pipeline that fires on push to `main`:

  ```yaml
  name: Deploy

  on:
    push:
      branches: [main]

  jobs:
    deploy:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 22
            cache: npm
        - run: npm ci
        - run: npx astro sync
        - run: npm run build
          env:
            SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
            SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
        - uses: cloudflare/wrangler-action@v3
          with:
            apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
            accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
  ```

---

## Phase 2 — Human gates (Cloudflare + Secrets setup)

> **Must be completed before Phase 3. Agent cannot do these.**

### 2.1 Cloudflare account + scoped API token

- [ ] Log in at `dash.cloudflare.com`
- [ ] Find your **Account ID**: Workers & Pages → Overview → right-hand sidebar
- [ ] Create a **scoped API token**: Profile → API Tokens → Create Token → *Edit Cloudflare Workers* template
  - Permissions: `Workers Scripts:Edit`, `Workers Routes:Edit` — **do not add DNS or billing scope**
  - Zone resources: leave as default (All zones) unless restricting by domain
- [ ] Authenticate wrangler locally:
  ```
  ! wrangler login
  ```

### 2.2 Inject production secrets into the Worker

Run in your terminal (values from your Supabase project's API settings):

```bash
! wrangler secret put SUPABASE_URL
! wrangler secret put SUPABASE_KEY
```

Secrets are encrypted at Cloudflare and never appear in `wrangler.jsonc` or `wrangler tail` output. Do **not** put them in `wrangler.jsonc` `[vars]`.

### 2.3 Add GitHub repository secrets

Navigate to: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

| Secret name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API token from 2.1 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID from 2.1 |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon key |

---

## Phase 3 — First manual deploy

> **Agent-owned commands; requires Phase 2 complete.**

- [x] **3.1** Build and verify output — `dist/client/` (10 static files) + `dist/server/` generated ✅

- [x] **3.2** Deploy to Cloudflare Workers — `Uploaded pholio`, Version ID: `e78994ad-02fe-4076-b277-038cd0e7221a` ✅
  - Live URL: **https://pholio.rejlukasz.workers.dev**

- [x] **3.3** Verify deployment history:

  ```bash
  wrangler deployments list
  ```

- [ ] **3.4** Smoke-test the live URL:
  - `/` loads without error
  - `/auth/signin` form renders
  - Sign in with test credentials → redirects to `/dashboard`
  - Monitor for runtime errors: `wrangler tail pholio --status error --format json`

---

## Phase 4 — Supabase production config

> **Human gate. Requires the Workers URL from Phase 3.**

- [ ] Supabase dashboard → Authentication → URL Configuration:
  - **Site URL:** `https://pholio.<account>.workers.dev`
  - **Redirect URLs:** add `https://pholio.<account>.workers.dev/**`
- [ ] Re-test auth flow end-to-end on the production URL (signup → confirm email → login → logout)

---

## Phase 5 — Verify GitHub Actions CD

> **Agent-owned commands.**

- [ ] Push any commit to `main` and watch the Actions tab in GitHub
- [ ] Confirm the `Deploy` workflow runs green
- [ ] Confirm `wrangler deployments list` shows a new version matching the commit SHA

---

## Edge cases and support steps

### If: `dist/_worker.js/index.js` not found after build

The build did not produce the expected entry. Check for Astro build errors. Verify the actual output:
```bash
find dist -name "*.js" | head -20
```
If the entry is at a different path, update `main` in `wrangler.jsonc` to match.

### If: `wrangler deploy` reports CPU time limit exceeded in production

Error in `wrangler tail`: `Worker exceeded CPU time limit`

The free tier caps CPU at 10ms per request. The Supabase JWT verify + SSR route can exceed this. Upgrade to Workers Standard:
1. Cloudflare dashboard → Workers & Pages → current plan → Upgrade to Standard ($5/month)
2. Redeploy — no code changes required

### If: CJS-only npm dependency breaks `npm run build`

Error: `Dynamic require of "X" is not supported` or `require is not defined`

Add the offending package to `vite.ssr.noExternal` in `astro.config.mjs`:
```js
vite: {
  plugins: [tailwindcss()],
  ssr: { noExternal: ['package-name'] },
},
```
Audit each new dependency for ESM support before adding: check its `package.json` for `"type": "module"` or dual exports.

### If: `wrangler login` cannot run interactively

Use a token directly:
```bash
CLOUDFLARE_API_TOKEN=<token> wrangler deploy
```

### If: GitHub Actions build fails at `npm run build` with missing env vars

Verify the GitHub secrets in 2.3 are set and the workflow `env:` block names (`SUPABASE_URL`, `SUPABASE_KEY`) match the `astro:env/server` schema in `astro.config.mjs`.

### If: Supabase auth callback returns `invalid redirect URI`

The production domain isn't whitelisted. Re-do Phase 4 with the correct Workers URL. When adding a custom domain later, repeat this step with the new domain.

---

## Files modified by this plan

| File | Change |
|---|---|
| `wrangler.jsonc` | `name: pholio`, `assets.directory: ./dist/client` (main unchanged) |
| `context/foundation/tech-stack.md` | `deployment_target: cloudflare-workers` |
| `.github/workflows/ci.yml` | Branch `master` → `main` |
| `.github/workflows/deploy.yml` | New: CD workflow via `cloudflare/wrangler-action@v3` |

## Verification checklist (end state)

- [ ] `wrangler deployments list` shows a live `pholio` worker version
- [ ] `wrangler tail pholio --status error` shows no errors at idle
- [ ] Full auth flow works on production Workers URL
- [ ] GitHub Actions `Deploy` workflow is green on a push to `main`
