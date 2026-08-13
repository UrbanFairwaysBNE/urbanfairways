ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_coach boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_hourly_rate_peak numeric;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_type text NOT NULL DEFAULT 'bay',
  ADD COLUMN IF NOT EXISTS client_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_bookings_client_user_id ON public.bookings (client_user_id);

CREATE POLICY "Clients can view lessons booked for them"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (client_user_id = auth.uid());

CREATE POLICY "Clients can update lessons booked for them"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (client_user_id = auth.uid())
  WITH CHECK (client_user_id = auth.uid());