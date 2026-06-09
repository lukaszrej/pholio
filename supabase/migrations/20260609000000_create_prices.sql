-- Create prices cache table (global, no user_id — prices are public market data)
CREATE TABLE public.prices (
  ticker TEXT PRIMARY KEY,
  price NUMERIC(15,4) NOT NULL CHECK (price > 0),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.prices ENABLE ROW LEVEL SECURITY;

-- RLS Policies — any authenticated user can read and upsert prices
CREATE POLICY "Authenticated users can read prices"
  ON public.prices FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert prices"
  ON public.prices FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update prices"
  ON public.prices FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
