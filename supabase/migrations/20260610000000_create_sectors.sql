-- Create sectors cache table (global, no user_id — sector classification is market reference data)
CREATE TABLE public.sectors (
  ticker TEXT PRIMARY KEY,
  sector TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;

-- RLS Policies — any authenticated user can read and upsert sectors
CREATE POLICY "Authenticated users can read sectors"
  ON public.sectors FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert sectors"
  ON public.sectors FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update sectors"
  ON public.sectors FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
