CREATE TABLE public.pos_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pos_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_categories TO authenticated;
GRANT ALL ON public.pos_categories TO service_role;

ALTER TABLE public.pos_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view POS categories"
  ON public.pos_categories FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage POS categories"
  ON public.pos_categories FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pos_categories_updated_at
  BEFORE UPDATE ON public.pos_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.pos_categories (name, display_order) VALUES
  ('Golf', 0),
  ('Drinks & Snacks', 1),
  ('Merch & Other', 2)
ON CONFLICT (name) DO NOTHING;