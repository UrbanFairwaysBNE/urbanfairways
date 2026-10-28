ALTER TABLE public.bookings
  ALTER COLUMN duration_hours TYPE numeric USING duration_hours::numeric;