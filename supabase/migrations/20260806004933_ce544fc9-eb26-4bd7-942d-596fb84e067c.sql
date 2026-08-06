ALTER TABLE public.pricing_config ADD COLUMN IF NOT EXISTS requires_verification boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_sector text;