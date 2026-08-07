
-- 1. Corporate accounts
CREATE TABLE public.corporate_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL UNIQUE,
  company_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.corporate_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corporate_id uuid NOT NULL REFERENCES public.corporate_accounts(id) ON DELETE CASCADE,
  email text NOT NULL,
  user_id uuid,
  monthly_hour_cap numeric,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX corporate_staff_active_email_idx
  ON public.corporate_staff (lower(email)) WHERE status = 'active';
CREATE UNIQUE INDEX corporate_staff_active_user_idx
  ON public.corporate_staff (user_id) WHERE status = 'active' AND user_id IS NOT NULL;
CREATE INDEX corporate_staff_corp_idx ON public.corporate_staff (corporate_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.corporate_accounts TO authenticated;
GRANT ALL ON public.corporate_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corporate_staff TO authenticated;
GRANT ALL ON public.corporate_staff TO service_role;

ALTER TABLE public.corporate_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_staff ENABLE ROW LEVEL SECURITY;

-- 2. Corporate flag on packs
ALTER TABLE public.pack_products
  ADD COLUMN IF NOT EXISTS is_corporate boolean NOT NULL DEFAULT false;

-- 3. Lookup helpers (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.corporate_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ca.id
  FROM public.corporate_accounts ca
  WHERE ca.is_active = true
    AND (
      ca.owner_user_id = _user_id
      OR EXISTS (
        SELECT 1 FROM public.corporate_staff cs
        WHERE cs.corporate_id = ca.id
          AND cs.user_id = _user_id
          AND cs.status = 'active'
      )
    )
  LIMIT 1
$$;

-- Returns the user whose pack wallet this user may spend from (NULL if not corporate).
CREATE OR REPLACE FUNCTION public.pack_wallet_owner(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ca.owner_user_id
  FROM public.corporate_accounts ca
  WHERE ca.id = public.corporate_id_for_user(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_corporate_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.corporate_accounts
    WHERE owner_user_id = _user_id AND is_active = true
  )
$$;

GRANT EXECUTE ON FUNCTION public.corporate_id_for_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pack_wallet_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_corporate_owner(uuid) TO authenticated, service_role;

-- 4. Policies
CREATE POLICY "Admins manage corporate accounts" ON public.corporate_accounts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Members view their corporate account" ON public.corporate_accounts
  FOR SELECT TO authenticated
  USING (id = public.corporate_id_for_user(auth.uid()));

CREATE POLICY "Admins manage corporate staff" ON public.corporate_staff
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners manage their staff" ON public.corporate_staff
  FOR ALL TO authenticated
  USING (corporate_id IN (
    SELECT id FROM public.corporate_accounts
    WHERE owner_user_id = auth.uid() AND is_active = true
  ))
  WITH CHECK (corporate_id IN (
    SELECT id FROM public.corporate_accounts
    WHERE owner_user_id = auth.uid() AND is_active = true
  ));

CREATE POLICY "Staff view their own entry" ON public.corporate_staff
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Corporate members view company lots" ON public.pack_lots
  FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND user_id = public.pack_wallet_owner(auth.uid()));

CREATE TRIGGER update_corporate_accounts_updated_at
  BEFORE UPDATE ON public.corporate_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_corporate_staff_updated_at
  BEFORE UPDATE ON public.corporate_staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Auto-link staff invited before they had an account
CREATE OR REPLACE FUNCTION public.link_corporate_staff_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.corporate_staff
     SET user_id = NEW.user_id, updated_at = now()
   WHERE user_id IS NULL
     AND status = 'active'
     AND lower(email) = lower(trim(NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_link_corporate_staff
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.link_corporate_staff_on_signup();

-- 6. Hours used against the company wallet this calendar month (Brisbane)
CREATE OR REPLACE FUNCTION public.corporate_hours_used_this_month(_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(-t.hours), 0)
  FROM public.pack_transactions t
  JOIN public.pack_lots l ON l.id = t.lot_id
  WHERE t.user_id = _user_id
    AND t.hours < 0
    AND l.user_id IS DISTINCT FROM _user_id
    AND (t.created_at AT TIME ZONE 'Australia/Brisbane')
        >= date_trunc('month', (now() AT TIME ZONE 'Australia/Brisbane'))
$$;

GRANT EXECUTE ON FUNCTION public.corporate_hours_used_this_month(uuid) TO authenticated, service_role;

-- 7. Balance now includes the company wallet
CREATE OR REPLACE FUNCTION public.pack_hours_balance(_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(hours_remaining), 0)
  FROM public.pack_lots
  WHERE (user_id = _user_id OR user_id = public.pack_wallet_owner(_user_id))
    AND status = 'active'
    AND hours_remaining > 0
    AND (expires_at IS NULL OR expires_at > now())
$$;

-- 8. Consumption: company hours first, then personal, honouring per-staff caps
CREATE OR REPLACE FUNCTION public.consume_pack_hours(
  _user_id uuid,
  _hours numeric,
  _transaction_type text DEFAULT 'booking',
  _booking_id uuid DEFAULT NULL,
  _description text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining numeric := _hours;
  take numeric;
  lot RECORD;
  bal numeric;
  corp_owner uuid;
  cap numeric;
  corp_allow numeric := NULL;
BEGIN
  IF _user_id IS NULL OR _hours IS NULL OR _hours <= 0 THEN
    RETURN 0;
  END IF;

  IF auth.uid() IS NOT NULL
     AND auth.uid() <> _user_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not permitted to spend another user''s prepaid hours';
  END IF;

  corp_owner := public.pack_wallet_owner(_user_id);
  IF corp_owner = _user_id THEN
    corp_owner := NULL;
  END IF;

  IF corp_owner IS NOT NULL THEN
    SELECT monthly_hour_cap INTO cap
    FROM public.corporate_staff
    WHERE user_id = _user_id AND status = 'active'
    LIMIT 1;

    IF cap IS NOT NULL THEN
      corp_allow := GREATEST(0, cap - public.corporate_hours_used_this_month(_user_id));
    END IF;
  END IF;

  FOR lot IN
    SELECT id, hours_remaining, user_id
    FROM public.pack_lots
    WHERE (user_id = _user_id OR (corp_owner IS NOT NULL AND user_id = corp_owner))
      AND status = 'active'
      AND hours_remaining > 0
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY (user_id IS DISTINCT FROM _user_id) DESC, expires_at NULLS LAST, purchased_at
    FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0;

    take := LEAST(lot.hours_remaining, remaining);

    IF lot.user_id IS DISTINCT FROM _user_id AND corp_allow IS NOT NULL THEN
      take := LEAST(take, corp_allow);
    END IF;

    CONTINUE WHEN take <= 0;

    UPDATE public.pack_lots
       SET hours_remaining = hours_remaining - take,
           status = CASE WHEN hours_remaining - take <= 0 THEN 'depleted' ELSE 'active' END,
           updated_at = now()
     WHERE id = lot.id;

    IF lot.user_id IS DISTINCT FROM _user_id AND corp_allow IS NOT NULL THEN
      corp_allow := corp_allow - take;
    END IF;

    remaining := remaining - take;

    SELECT public.pack_hours_balance(_user_id) INTO bal;

    INSERT INTO public.pack_transactions
      (user_id, lot_id, hours, balance_after, transaction_type, related_booking_id, description)
    VALUES (_user_id, lot.id, -take, bal, _transaction_type, _booking_id, _description);
  END LOOP;

  RETURN _hours - remaining;
END;
$$;

-- 9. Restores also target the company wallet
CREATE OR REPLACE FUNCTION public.restore_pack_hours(
  _user_id uuid,
  _hours numeric,
  _transaction_type text DEFAULT 'refund',
  _booking_id uuid DEFAULT NULL,
  _description text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining numeric := _hours;
  give numeric;
  lot RECORD;
  bal numeric;
  corp_owner uuid;
BEGIN
  IF _user_id IS NULL OR _hours IS NULL OR _hours <= 0 THEN
    RETURN 0;
  END IF;

  IF auth.uid() IS NOT NULL
     AND auth.uid() <> _user_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not permitted to modify another user''s prepaid hours';
  END IF;

  corp_owner := public.pack_wallet_owner(_user_id);
  IF corp_owner = _user_id THEN
    corp_owner := NULL;
  END IF;

  FOR lot IN
    SELECT id, hours_total, hours_remaining, user_id
    FROM public.pack_lots
    WHERE (user_id = _user_id OR (corp_owner IS NOT NULL AND user_id = corp_owner))
      AND status IN ('active', 'depleted')
      AND (expires_at IS NULL OR expires_at > now())
      AND hours_remaining < hours_total
    ORDER BY (user_id IS DISTINCT FROM _user_id) DESC, expires_at NULLS LAST, purchased_at
    FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0;
    give := LEAST(lot.hours_total - lot.hours_remaining, remaining);

    UPDATE public.pack_lots
       SET hours_remaining = hours_remaining + give,
           status = 'active',
           updated_at = now()
     WHERE id = lot.id;

    remaining := remaining - give;

    SELECT public.pack_hours_balance(_user_id) INTO bal;

    INSERT INTO public.pack_transactions
      (user_id, lot_id, hours, balance_after, transaction_type, related_booking_id, description)
    VALUES (_user_id, lot.id, give, bal, _transaction_type, _booking_id, _description);
  END LOOP;

  RETURN _hours - remaining;
END;
$$;

-- 10. Seed the first corporate pack
INSERT INTO public.pack_products (name, description, hours, price, validity_days, is_active, display_order, is_corporate)
VALUES ('Corporate Pack 50', '50 hours of simulator time for your team, valid 12 months.', 50, 1000, 365, true, 0, true);
