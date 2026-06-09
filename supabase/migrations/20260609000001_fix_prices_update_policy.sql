-- Add explicit WITH CHECK to prices UPDATE policy (pattern consistency with transactions migration)
DROP POLICY IF EXISTS "Authenticated users can update prices" ON public.prices;
CREATE POLICY "Authenticated users can update prices"
  ON public.prices FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
