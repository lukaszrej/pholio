# Repository Guidelines

Pholio is a broker-independent investment portfolio tracker for long-term individual investors — see @README.md for the full tech-stack breakdown.

## Hard Rules

- **Protected routes**: list every path requiring authentication in the `PROTECTED_ROUTES` array in `src/middleware.ts`; do not add inline auth checks elsewhere.
- **Server-only secrets**: declare all env vars in the `astro:env` schema in `src/env.d.ts`; never reference them in client-side code. Required variable names are in `@.env.example`.
- **No `set:html` directive**: ESLint `no-set-html-directive` is `error`; use text interpolation or a sanitizing component instead.
- **RLS is the access-control layer**: all Supabase queries must run as the authenticated user so Row Level Security enforces per-user data isolation; do not use the service role key in user-facing code paths.
- **No custom DB migrations for MVP**: Supabase uses only the built-in `auth.users` table; any schema change needs explicit approval before adding migrations to `supabase/`.

## Project Structure

Pages live in `src/pages/` — API handlers in `src/pages/api/`, auth flow in `src/pages/auth/`. UI components live in `src/components/` (Astro and React); shared primitives go in `src/components/ui/`. Shared utilities are in `src/lib/` (`supabase.ts`, `utils.ts`). Route-guard logic is in `src/middleware.ts`. Supabase local config is in `supabase/config.toml`. Product context (PRD, tech-stack decisions) is in `context/foundation/`.

## Build, Test, and Development Commands

See @README.md (Available Scripts) for the full command list. Non-obvious notes:

- `npm run build` — run `npx astro sync` first if type errors appear.
- `npm run format` — Prettier is configured for 120-col, double quotes, trailing commas, and Tailwind class sorting.
- `npx wrangler deploy` — secrets must be set in the Cloudflare dashboard, not in `wrangler.jsonc`.

No test suite is configured; the CI gate (`.github/workflows/ci.yml`) runs lint and build only.

## Coding Style & Naming Conventions

Use the `@/*` path alias for all imports from `src/` (e.g. `import { X } from "@/lib/utils"`); see `@tsconfig.json` for the full compiler config. Husky runs lint-staged on every commit: ESLint auto-fix on `.ts`/`.tsx`/`.astro` files, Prettier on `.json`/`.css`/`.md` files — do not skip the hook.

## Commit & Pull Request Guidelines

No commit-message prefix convention is established yet — update this line when the team adopts one (record the decision in `context/foundation/tech-stack.md`). The CI gate requires lint and build to pass on every PR to `master`.
