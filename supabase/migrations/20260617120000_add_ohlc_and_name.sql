-- Extend prices table with full OHLC + absolute change fields (all nullable; backfill on next refresh)
ALTER TABLE public.prices
  ADD COLUMN change_abs NUMERIC(8,4),
  ADD COLUMN high NUMERIC(15,4),
  ADD COLUMN low NUMERIC(15,4),
  ADD COLUMN open NUMERIC(15,4),
  ADD COLUMN prev_close NUMERIC(15,4);

-- Extend sectors table with company name field (nullable; backfill on next refresh)
ALTER TABLE public.sectors
  ADD COLUMN name TEXT;
