ALTER TABLE public.door_access_settings DROP CONSTRAINT door_access_settings_provider_chk;
ALTER TABLE public.door_access_settings ADD CONSTRAINT door_access_settings_provider_chk CHECK (provider = ANY (ARRAY['manual','tuya','ttlock']));
UPDATE public.door_access_settings SET provider='ttlock', tuya_device_id='26962171,26952501', enabled=true, updated_at=now() WHERE id='global';