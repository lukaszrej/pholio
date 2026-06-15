-- Explicit table-level GRANTs for anon and authenticated roles.
-- Supabase CLI 2.x does not auto-grant these in local dev; RLS policies alone are not enough.
-- The service_role key still bypasses both grants and RLS.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transactions TO authenticated;
GRANT SELECT ON TABLE public.transactions TO anon;

GRANT SELECT, INSERT, UPDATE ON TABLE public.prices TO authenticated;
GRANT SELECT ON TABLE public.prices TO anon;

GRANT SELECT ON TABLE public.sectors TO authenticated, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portfolios TO authenticated;
GRANT SELECT ON TABLE public.portfolios TO anon;
