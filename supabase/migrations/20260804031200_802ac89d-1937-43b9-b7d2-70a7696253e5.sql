ALTER TABLE public.pricing_config
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS restrictions text,
  ADD COLUMN IF NOT EXISTS off_peak_hourly_rate numeric,
  ADD COLUMN IF NOT EXISTS restricted_to_off_peak boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grants_league_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grants_range_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS single_bay_at_peak boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS pricing_config_single_default_idx
  ON public.pricing_config (is_default)
  WHERE is_default;

DELETE FROM public.pricing_config;
DELETE FROM public.pos_products;
DELETE FROM public.gift_cards;
DELETE FROM public.loyalty_promo_settings;
DELETE FROM public.marketing_campaigns;
DELETE FROM public.marketing_templates;