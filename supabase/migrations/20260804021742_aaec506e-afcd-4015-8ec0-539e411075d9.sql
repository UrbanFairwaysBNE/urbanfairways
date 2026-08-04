CREATE TABLE public.tenant_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_name text NOT NULL DEFAULT 'Your Venue',
  legal_entity text NOT NULL DEFAULT '',
  abn text NOT NULL DEFAULT '',
  booking_domain text NOT NULL DEFAULT 'example.com',
  hub_domain text NOT NULL DEFAULT 'hub.example.com',
  support_phone text NOT NULL DEFAULT '',
  support_email text NOT NULL DEFAULT 'info@example.com',
  sender_email text NOT NULL DEFAULT 'noreply@example.com',
  admin_alert_email text NOT NULL DEFAULT 'admin@example.com',
  address_line text NOT NULL DEFAULT '',
  suburb text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  postcode text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'Australia/Brisbane',
  socials jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tenant_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_settings TO authenticated;
GRANT ALL ON public.tenant_settings TO service_role;

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tenant settings"
  ON public.tenant_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert tenant settings"
  ON public.tenant_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update tenant settings"
  ON public.tenant_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete tenant settings"
  ON public.tenant_settings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_tenant_settings_updated_at
  BEFORE UPDATE ON public.tenant_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.tenant_settings (venue_name) VALUES ('Your Venue');