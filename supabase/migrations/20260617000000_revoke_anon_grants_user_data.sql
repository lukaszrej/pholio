-- Remove anon SELECT grants on user-owned tables.
-- transactions and portfolios are private per-user data; no public-read endpoint
-- exists for either table. Granting anon SELECT is unnecessary and creates a
-- defense-in-depth risk: if RLS is accidentally disabled, anon clients could
-- read all rows without authentication.
-- prices and sectors retain anon SELECT (market reference data, no user ownership).
--
-- Note: the grant_table_permissions migration (20260615000000) only granted SELECT
-- to anon on transactions and portfolios — INSERT/UPDATE/DELETE were never issued
-- to anon for these tables. This migration therefore covers the full anon grant surface.

REVOKE SELECT ON TABLE public.transactions FROM anon;
REVOKE SELECT ON TABLE public.portfolios FROM anon;
