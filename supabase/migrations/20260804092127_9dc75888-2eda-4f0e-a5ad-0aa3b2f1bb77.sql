INSERT INTO public.system_settings (id, timezone) VALUES ('global', 'Australia/Brisbane')
ON CONFLICT (id) DO UPDATE SET timezone = 'Australia/Brisbane';
ALTER TABLE public.system_settings ALTER COLUMN timezone SET DEFAULT 'Australia/Brisbane';
UPDATE public.system_settings SET timezone = 'Australia/Brisbane' WHERE timezone IS DISTINCT FROM 'Australia/Brisbane';