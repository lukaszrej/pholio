-- Add portfolio_id FK to transactions (nullable initially for backfill)
ALTER TABLE public.transactions ADD COLUMN portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE RESTRICT;

-- Backfill: create one "My Portfolio" per existing user and assign their transactions
DO $$
DECLARE
  uid UUID;
  pid UUID;
BEGIN
  FOR uid IN (SELECT DISTINCT user_id FROM public.transactions WHERE portfolio_id IS NULL)
  LOOP
    INSERT INTO public.portfolios (user_id, name) VALUES (uid, 'My Portfolio') RETURNING id INTO pid;
    UPDATE public.transactions SET portfolio_id = pid WHERE user_id = uid AND portfolio_id IS NULL;
  END LOOP;
END;
$$;

-- Enforce NOT NULL now that all rows are backfilled
ALTER TABLE public.transactions ALTER COLUMN portfolio_id SET NOT NULL;

-- Index for portfolio_id queries
CREATE INDEX idx_transactions_portfolio_id ON public.transactions(portfolio_id);
