ALTER TABLE public.local_comp_settings
  ADD COLUMN IF NOT EXISTS comp_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS comp_day smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS comp_start_time time NOT NULL DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS comp_end_time time NOT NULL DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS comp_duration_hours numeric NOT NULL DEFAULT 2;

GRANT SELECT ON public.local_comp_settings TO anon;
GRANT SELECT ON public.local_comp_settings TO authenticated;