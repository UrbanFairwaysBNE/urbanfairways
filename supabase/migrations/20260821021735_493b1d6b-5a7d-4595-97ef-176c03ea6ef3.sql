ALTER TABLE public.pricing_config
  ADD COLUMN IF NOT EXISTS extend_30min_price numeric,
  ADD COLUMN IF NOT EXISTS extend_60min_price numeric;