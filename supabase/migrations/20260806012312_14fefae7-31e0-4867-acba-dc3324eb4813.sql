ALTER TABLE public.pricing_config
  ADD COLUMN IF NOT EXISTS marketing_tag text,
  ADD COLUMN IF NOT EXISTS marketing_badge text,
  ADD COLUMN IF NOT EXISTS marketing_note text,
  ADD COLUMN IF NOT EXISTS is_highlighted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_on_marketing boolean NOT NULL DEFAULT true;

UPDATE public.pricing_config SET marketing_tag = 'Off-peak access' WHERE tier = 'practice_club';
UPDATE public.pricing_config SET marketing_tag = 'Suits Most', marketing_badge = 'Most Popular', is_highlighted = true WHERE tier = 'birdie';
UPDATE public.pricing_config SET marketing_tag = 'Best value per round' WHERE tier = 'eagle';
UPDATE public.pricing_config SET marketing_tag = 'Frontline & essential workers', marketing_note = 'This membership is available to Emergency Services, Defence & Healthcare workers' WHERE tier = 'frontline';
UPDATE public.pricing_config SET marketing_tag = 'Pay as you go' WHERE tier = 'casual';