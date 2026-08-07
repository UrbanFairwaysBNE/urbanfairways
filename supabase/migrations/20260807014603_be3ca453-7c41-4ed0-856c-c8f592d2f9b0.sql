
CREATE POLICY "Corporate owners view usage of their lots" ON public.pack_transactions
  FOR SELECT TO authenticated
  USING (
    lot_id IN (SELECT id FROM public.pack_lots WHERE user_id = auth.uid())
  );
