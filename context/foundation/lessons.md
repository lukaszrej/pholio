# Lessons — Recurring Rules & Pitfalls

## L1 — Cloudflare Workers: use text env vars, not secrets, for `astro:env/server`

**Context:** `@astrojs/cloudflare` v13 + Astro v6 + `nodejs_compat`

`wrangler secret put` stores values encrypted and exposes them only via the Cloudflare `env` binding object (the fetch handler's second argument, or `import { env } from "cloudflare:workers"`). However, `astro:env/server` defaults to reading from `process.env[key]`. The `setGetEnv(createGetEnv(env))` bridging mechanism in the built worker is supposed to switch the reader to Cloudflare's env object at module init, but it does not reliably do so in practice — resulting in `SUPABASE_URL` / `SUPABASE_KEY` staying `undefined` at runtime despite secrets being correctly set.

**Rule:** For values consumed via `astro:env/server` (e.g. `SUPABASE_URL`, `SUPABASE_KEY`), add them as **text environment variables** in the Cloudflare dashboard (Workers → pholio → Settings → Variables and Secrets), not as wrangler secrets. With `nodejs_compat`, text vars are injected into `process.env` at Worker startup, which is what `astro:env` reads.

**Scope:** Only use `wrangler secret put` for credentials that must never appear in plaintext in the dashboard (e.g. service role keys, private API keys). Supabase anon keys and project URLs are public by design and safe as text vars.

---

## L2 — Disable Cloudflare's GitHub integration when using GitHub Actions for CD

If you connect a Cloudflare Worker to a GitHub repo via the Cloudflare dashboard's Git Integration, Cloudflare triggers its own build-and-deploy on every push — independently of GitHub Actions. This build runs without your GitHub secrets (no `SUPABASE_URL`, etc.), produces a broken artifact, and deploys it AFTER GitHub Actions finishes, overwriting the correct build.

**Rule:** When GitHub Actions owns the deploy pipeline (`cloudflare/wrangler-action`), disconnect the Cloudflare Git Integration: Workers → pholio → Settings → Git Integration → Disconnect. These two CD paths are mutually exclusive; running both causes the last one to win (usually Cloudflare's broken build).
