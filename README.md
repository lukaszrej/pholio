# Pholio

A broker-agnostic personal investment portfolio tracker for long-term individual investors. Add your stock transactions manually and get a clear view of your current portfolio value, ROI per position, and sector allocation — all in one place.

## Features

- Track stock purchases across multiple portfolios
- EOD (end-of-day) price updates via [Finnhub](https://finnhub.io/)
- ROI per position — gain/loss in % and absolute value
- Sector allocation chart
- Per-user data isolation enforced at the database level (Supabase RLS)
- Email/password authentication

## Tech Stack

- [Astro](https://astro.build/) v6 — server-side rendered web framework
- [React](https://react.dev/) v19 — interactive UI components
- [TypeScript](https://www.typescriptlang.org/) v5 — type-safe throughout
- [Tailwind CSS](https://tailwindcss.com/) v4 — utility-first styling
- [Supabase](https://supabase.com/) — authentication + PostgreSQL with RLS
- [Cloudflare Workers](https://workers.cloudflare.com/) — edge deployment runtime
- [Finnhub](https://finnhub.io/) — stock quotes and company profiles
- [Vitest](https://vitest.dev/) — unit and integration tests

## Prerequisites

- Node.js v22.14.0 (see `.nvmrc`)
- npm (comes with Node.js)
- [Docker](https://www.docker.com/) and ~7 GB RAM (for local Supabase)
- A free [Finnhub API key](https://finnhub.io/register)

## Getting Started

1. Clone the repository:

```bash
git clone <repo-url>
cd pholio
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables — see [Environment Variables](#environment-variables) below.

4. Set up Supabase — see [Supabase Configuration](#supabase-configuration) below.

5. Create a `.dev.vars` file for local Cloudflare dev secrets (same values as `.env`):

```bash
cp .env .dev.vars
```

6. Run the development server:

```bash
npm run dev
```

## Environment Variables

Create a `.env` file at the project root with the following variables:

| Variable          | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `SUPABASE_URL`    | Supabase project URL (local: `http://127.0.0.1:54321`)                   |
| `SUPABASE_KEY`    | Supabase `anon` public key                                               |
| `FINNHUB_API_KEY` | Finnhub API key — free tier at [finnhub.io](https://finnhub.io/register) |

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key>
FINNHUB_API_KEY=<finnhub key>
```

These variables are declared as **server-only secrets** via Astro's `astro:env` schema — they are never exposed to the client.

## Available Scripts

- `npm run dev` — start development server
- `npm run build` — build for production
- `npm run preview` — preview production build
- `npm run typecheck` — TypeScript / Astro type check
- `npm run lint` — run ESLint with type-checked rules
- `npm run lint:fix` — auto-fix ESLint issues
- `npm run format` — run Prettier
- `npm run test` — run unit tests
- `npm run test:watch` — unit tests in watch mode
- `npm run test:integration` — integration tests (requires local Supabase running)

## Project Structure

```
src/
├── components/
│   ├── auth/           # Sign-in / sign-up forms
│   ├── portfolio/      # Portfolio table, watchlist, sector chart
│   ├── transactions/   # Dashboard view, add/edit transaction form
│   └── ui/             # shadcn/Radix UI primitives
├── lib/                # Business logic (portfolio math, prices, Finnhub, Supabase)
├── pages/
│   ├── api/
│   │   ├── auth/       # Auth endpoints (sign-in, sign-up, sign-out, callback)
│   │   ├── portfolios/ # Portfolio CRUD
│   │   ├── transactions/ # Transaction CRUD
│   │   └── watchlist/  # Live quote endpoint
│   ├── auth/           # Auth pages (sign-in, sign-up, confirm-email)
│   └── dashboard.astro # Protected dashboard
├── types/              # Shared TypeScript types
└── middleware.ts        # Route protection
public/
supabase/
├── config.toml         # Local Supabase configuration
└── migrations/         # Database schema migrations
wrangler.jsonc          # Cloudflare Workers configuration
```

## Supabase Configuration

### Local development (recommended)

Requires [Docker](https://www.docker.com/) with ~7 GB RAM available.

1. Start the local Supabase stack (downloads Docker images on first run):

```bash
npx supabase start
```

2. Copy the printed credentials into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

3. Apply migrations:

```bash
npx supabase db reset
```

4. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

### Using a cloud Supabase project

If you prefer a hosted project, create one at [supabase.com](https://supabase.com) and push the migrations:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Then set the credentials in your `.env` and `.dev.vars`:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon key from Supabase dashboard → Settings → API>
```

### Auth routes

| Route                 | Description                                                     |
| --------------------- | --------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                     |
| `/auth/signup`        | Email/password sign-up form                                     |
| `/auth/confirm-email` | Post-signup "check your inbox" page                             |
| `/dashboard`          | Protected dashboard (redirects to sign-in if not authenticated) |

Route protection is configured in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL`, `SUPABASE_KEY`, and `FINNHUB_API_KEY` as secrets in your Cloudflare dashboard or via:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
npx wrangler secret put FINNHUB_API_KEY
```

## CI

GitHub Actions runs lint + typecheck + build on every push and PR to `main`. Configure `SUPABASE_URL`, `SUPABASE_KEY`, and `FINNHUB_API_KEY` as repository secrets in GitHub for the build step.

## License

MIT
