-- Explicit table-level GRANTs for anon, authenticated, and service_role.
-- Supabase CLI 2.x does not auto-grant these in local dev; RLS policies alone are not enough.
-- service_role bypasses RLS but still requires table-level GRANTs in local dev.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transactions TO authenticated, service_role;
GRANT SELECT ON TABLE public.transactions TO anon;

GRANT SELECT, INSERT, UPDATE ON TABLE public.prices TO authenticated, service_role;
GRANT SELECT ON TABLE public.prices TO anon;

GRANT SELECT ON TABLE public.sectors TO authenticated, anon, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portfolios TO authenticated, service_role;
GRANT SELECT ON TABLE public.portfolios TO anon;
