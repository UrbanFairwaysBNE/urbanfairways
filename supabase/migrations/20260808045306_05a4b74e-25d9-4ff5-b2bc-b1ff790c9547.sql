ALTER TABLE public.door_codes DROP CONSTRAINT IF EXISTS door_codes_status_chk;
ALTER TABLE public.door_codes ADD CONSTRAINT door_codes_status_chk
  CHECK (status = ANY (ARRAY['scheduled'::text,'pending'::text,'active'::text,'revoked'::text,'expired'::text,'failed'::text]));

CREATE UNIQUE INDEX IF NOT EXISTS door_codes_one_daily_per_day
  ON public.door_codes (valid_from)
  WHERE scope = 'daily' AND status = ANY (ARRAY['scheduled'::text,'pending'::text,'active'::text]);