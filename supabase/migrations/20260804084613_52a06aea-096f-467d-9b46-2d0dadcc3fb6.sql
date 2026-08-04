CREATE TABLE public.pricing_specials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  duration_minutes integer NOT NULL,
  price numeric NOT NULL,
  applies_peak boolean NOT NULL DEFAULT true,
  applies_off_peak boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pricing_specials TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_specials TO authenticated;
GRANT ALL ON public.pricing_specials TO service_role;

ALTER TABLE public.pricing_specials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view specials"
  ON public.pricing_specials FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage specials"
  ON public.pricing_specials FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pricing_specials_updated_at
  BEFORE UPDATE ON public.pricing_specials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();