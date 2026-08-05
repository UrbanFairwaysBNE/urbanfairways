ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS pack_hours_used numeric(6,2) NOT NULL DEFAULT 0;

ALTER TABLE public.pos_transactions
  ADD COLUMN IF NOT EXISTS pack_hours_used numeric(6,2) NOT NULL DEFAULT 0;