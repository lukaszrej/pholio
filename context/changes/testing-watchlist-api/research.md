---
date: 2026-06-20T00:00:00+00:00
researcher: Claude Sonnet 4.6
git_commit: b2aa978bc6cbfb5dc5c9b860b7b23ba92ed1128c
branch: main
repository: Pholio
topic: "What do we need to know about /api/watchlist to write security and functional tests?"
tags: [research, watchlist, api, testing, security, auth]
status: complete
last_updated: 2026-06-20
last_updated_by: Claude Sonnet 4.6
---

# Research: Testing the /api/watchlist endpoint

**Date**: 2026-06-20
**Researcher**: Claude Sonnet 4.6
**Git Commit**: b2aa978bc6cbfb5dc5c9b860b7b23ba92ed1128c
**Branch**: main
**Repository**: Pholio

## Research Question

What does the `/api/watchlist` endpoint do, how is it protected, and what tests are needed to cover it — specifically the auth guard, cross-user isolation, and IDOR scenarios described in the test plan's Risk #2, #3, and #4?

## Summary

**The watchlist has no database table and no write endpoints.** The security risk profile is therefore much simpler than `/api/transactions`:

- **Risk #3 (unauthenticated access)** — applicable. Middleware + route-level guard must block unauthenticated GET.
- **Risk #2 (cross-user read)** — not applicable. The endpoint reads from `prices` and `sectors`, which are global shared-cache tables with no `user_id`. There is no user-owned data to leak.
- **Risk #4 (IDOR write)** — not applicable. There are no write endpoints (POST/PATCH/DELETE). Watchlist items live in browser `localStorage` only.

The test scope for this change is: **one security test (auth guard) + one functional integration test (authenticated happy-path response shape)**.

---

## Detailed Findings

### 1. Endpoint inventory

**File:** `src/pages/api/watchlist/quotes.ts`

Only one file in `src/pages/api/watchlist/` — `quotes.ts` (plus its test stub `quotes.test.ts`). There is no index route, no POST/PATCH/DELETE handler.

| Method | Path                    | Handler                             |
| ------ | ----------------------- | ----------------------------------- |
| GET    | `/api/watchlist/quotes` | `src/pages/api/watchlist/quotes.ts` |

No other watchlist API routes exist.

### 2. Auth guard — two layers

**Layer 1 — Middleware** (`src/middleware.ts:4-6`):

```
PROTECTED_ROUTES    = ["/dashboard"]
PROTECTED_API_ROUTES = ["/api/"]
PUBLIC_API_ROUTES   = ["/api/auth/"]
```

`/api/watchlist/quotes` matches `PROTECTED_API_ROUTES` and does NOT match `PUBLIC_API_ROUTES`, so the middleware checks `context.locals.user` and returns `{ "error": "Unauthorized" }` with status 401 before the route handler fires.

**Layer 2 — Route handler** (`src/pages/api/watchlist/quotes.ts:16-21`):

```typescript
if (!context.locals.user) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
}
```

This is a double-check. Both layers independently guard the route.

**Supabase client** (`quotes.ts:41`): `createClient(context.request.headers, context.cookies)` — anon key + JWT from cookies. Not service-role.

### 3. Request shape

Query parameter: `?tickers=AAPL,MSFT,GOOGL` (comma-separated, required).

Validation logic (`quotes.ts:24-39`):

- Splits on comma, trims, uppercases, deduplicates via `Set`
- Caps at 25 tickers max
- Returns 400 `{ error: "Bad Request" }` if result is empty

### 4. Data sources — no user-owned tables

The route does not query `transactions` or `portfolios`. It delegates to two lib functions:

| Function                                       | Source table | Ownership                                                   |
| ---------------------------------------------- | ------------ | ----------------------------------------------------------- |
| `refreshPricesForTickers()` (`@/lib/prices`)   | `prices`     | Global — no `user_id`, accessible to any authenticated user |
| `refreshSectorsForTickers()` (`@/lib/sectors`) | `sectors`    | Global — no `user_id`, accessible to any authenticated user |

**Conclusion:** No user-owned data is ever returned. User A and User B querying the same ticker get identical data. Cross-user isolation is structurally impossible to violate here.

### 5. Response shape

```typescript
{
  data: {
    [ticker: string]: {
      ticker: string;
      name: string | null;
      c: number;           // current price
      d: number | null;    // change absolute
      dp: number | null;   // change percent
      h: number | null;    // high
      l: number | null;    // low
      o: number | null;    // open
      pc: number | null;   // previous close
    }
  }
}
```

Tickers with no price data are absent from the dict (not included with null values).

### 6. No watchlist database table — ever

All 11 migrations read. Tables that exist: `transactions`, `prices`, `sectors`, `portfolios`. No watchlist table was ever created. The watchlist is 100% client-side:

- **Storage:** `localStorage` key `pholio_watchlist` — a `string[]` of ticker symbols (`src/components/portfolio/WatchlistPanel.tsx:21`)
- **Default tickers on first load:** `["AAPL", "NVDA", "MSFT", "TSLA"]` (line 20)
- **Quote data:** fetched on demand from `/api/watchlist/quotes` (line 40)

The archived change (`context/archive/2026-06-17-watchlist-live-quotes/`) represents completed work wiring live Finnhub data into this flow — not a removal of a DB table.

### 7. RLS on shared cache tables (prices, sectors)

Both tables use `auth.role() = 'authenticated'` policies — not `auth.uid() = user_id`. Any signed-in user can read and write them. This is intentional (they are a shared price cache), and it is already flagged in `context/foundation/lessons.md` (L3: "The `prices` table allows any authenticated user to INSERT/UPDATE prices"). No per-user RLS gap exists to test for the watchlist endpoint.

### 8. Existing test infrastructure that applies

| Helper               | Location                                                | Use for watchlist tests                                         |
| -------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| `makeContext()`      | `src/test/integration/helpers/middleware-context.ts`    | Auth guard test — build synthetic context with no Cookie header |
| `buildFixture()`     | `src/test/integration/helpers/users.ts`                 | Happy-path test — get an authenticated anon-key client          |
| `buildAdminClient()` | `src/test/integration/prices.integration.test.ts:13-22` | Seed price/sector rows for happy-path assertion                 |

The integration config at `vitest.integration.config.ts:14` picks up `src/**/*.integration.test.ts` — the new test file will be auto-discovered.

---

## Code References

- `src/pages/api/watchlist/quotes.ts:1` — route entry point, GET handler
- `src/pages/api/watchlist/quotes.ts:16-21` — route-level auth guard (double-check)
- `src/pages/api/watchlist/quotes.ts:24-39` — tickers query param parsing and validation
- `src/pages/api/watchlist/quotes.ts:41` — anon+JWT Supabase client construction
- `src/pages/api/watchlist/quotes.ts:49-51` — delegates to `refreshPricesForTickers` + `refreshSectorsForTickers`
- `src/middleware.ts:4-6` — PROTECTED_API_ROUTES catch-all (`/api/`) and PUBLIC_API_ROUTES exemption
- `src/middleware.ts:25-32` — 401 JSON response for unauthenticated API requests
- `src/components/portfolio/WatchlistPanel.tsx:21` — `localStorage` as the only persistent watchlist store
- `src/test/integration/helpers/middleware-context.ts:13-17` — `makeContext(method, pathname, cookieHeader?)` signature
- `src/test/integration/helpers/users.ts:26` — `buildFixture()` signature
- `vitest.integration.config.ts:14` — test discovery glob `src/**/*.integration.test.ts`

---

## Architecture Insights

**Stateless watchlist:** The absence of a `watchlist` table is a deliberate architectural choice, not an oversight. The API endpoint is a read-through cache: tickers arrive in the query string, prices/sectors are refreshed in the shared cache, and data is returned. No server-side state per user is created.

**Double auth guard:** Both middleware and route handler check `context.locals.user`. The route-level check is a defence-in-depth guard against any future middleware config change that might inadvertently expose the route. Tests should validate both layers independently (middleware test via `makeContext`, route test via direct HTTP call if needed).

**No IDOR surface:** Write IDOR requires a resource owned by a user that another user can target by ID. No such resource exists for the watchlist. The only writable tables (via this endpoint's lib functions) are global cache tables.

---

## Historical Context

- `context/archive/2026-06-17-watchlist-live-quotes/` — completed work (3 phases, all stamped) wiring live Finnhub quotes into the watchlist panel. Confirmed no DB table was ever created as part of this work.
- `context/changes/watchlist-skeleton-height/` — unrelated active change about UI skeleton height; no API impact.
- `context/foundation/lessons.md` (L2): WITH CHECK missing from RLS UPDATE policies — not applicable here since the shared cache tables use role-based (not user-id-based) policies and the watchlist endpoint has no write path.

---

## Open Questions

None — scope is fully resolved. The test plan for this change should cover exactly two scenarios:

1. **Auth guard**: Unauthenticated GET → 401 (via middleware `makeContext` helper)
2. **Authenticated happy path**: Signed-in user with valid tickers → 200 with expected response shape (using `buildFixture()` for a real authenticated session)

Optionally: 3. **Empty tickers param**: Authenticated GET with no tickers → 400 (cheap, covers input validation)
