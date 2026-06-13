-- Create portfolios table
CREATE TABLE public.portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can select own portfolios"
  ON public.portfolios FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own portfolios"
  ON public.portfolios FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own portfolios"
  ON public.portfolios FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own portfolios"
  ON public.portfolios FOR DELETE
  USING (auth.uid() = user_id);

-- Reuse shared trigger utility defined in 20260604111725_create_transactions.sql
CREATE TRIGGER set_portfolios_updated_at
  BEFORE UPDATE ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Index for user_id queries
CREATE INDEX idx_portfolios_user_id ON public.portfolios(user_id);
