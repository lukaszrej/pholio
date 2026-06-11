-- Add empty-string guards to sectors cache table
ALTER TABLE public.sectors
  ADD CONSTRAINT sectors_ticker_nonempty CHECK (ticker <> ''),
  ADD CONSTRAINT sectors_sector_nonempty CHECK (sector <> '');
