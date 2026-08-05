-- ============ PACK PRODUCTS ============
CREATE TABLE public.pack_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  hours numeric NOT NULL CHECK (hours > 0),
  price numeric NOT NULL CHECK (price >= 0),
  validity_days integer NOT NULL DEFAULT 90 CHECK (validity_days > 0),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pack_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pack_products TO authenticated;
GRANT ALL ON public.pack_products TO service_role;

ALTER TABLE public.pack_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active pack products"
  ON public.pack_products FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage pack products"
  ON public.pack_products FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pack_products_updated_at
  BEFORE UPDATE ON public.pack_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PACK LOTS ============
CREATE TABLE public.pack_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  product_id uuid REFERENCES public.pack_products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  hours_total numeric NOT NULL CHECK (hours_total > 0),
  hours_remaining numeric NOT NULL DEFAULT 0,
  price_paid numeric NOT NULL DEFAULT 0,
  validity_days integer NOT NULL DEFAULT 90,
  status text NOT NULL DEFAULT 'pending_payment',
  purchased_at timestamptz,
  expires_at timestamptz,
  is_gift boolean NOT NULL DEFAULT false,
  redemption_code text UNIQUE,
  purchaser_user_id uuid,
  purchaser_email text,
  purchaser_name text,
  recipient_name text,
  stripe_session_id text,
  stripe_payment_intent_id text,
  redeemed_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pack_lots_user_active ON public.pack_lots (user_id, status, expires_at);
CREATE INDEX idx_pack_lots_code ON public.pack_lots (redemption_code);

GRANT SELECT ON public.pack_lots TO authenticated;
GRANT ALL ON public.pack_lots TO service_role;

ALTER TABLE public.pack_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own pack lots"
  ON public.pack_lots FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = purchaser_user_id);

CREATE POLICY "Admins manage pack lots"
  ON public.pack_lots FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pack_lots_updated_at
  BEFORE UPDATE ON public.pack_lots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PACK TRANSACTIONS ============
CREATE TABLE public.pack_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lot_id uuid REFERENCES public.pack_lots(id) ON DELETE SET NULL,
  hours numeric NOT NULL,
  balance_after numeric NOT NULL DEFAULT 0,
  transaction_type text NOT NULL,
  related_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pack_transactions_user ON public.pack_transactions (user_id, created_at DESC);

GRANT SELECT ON public.pack_transactions TO authenticated;
GRANT ALL ON public.pack_transactions TO service_role;

ALTER TABLE public.pack_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own pack transactions"
  ON public.pack_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage pack transactions"
  ON public.pack_transactions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.pack_hours_balance(_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(hours_remaining), 0)
  FROM public.pack_lots
  WHERE user_id = _user_id
    AND status = 'active'
    AND hours_remaining > 0
    AND (expires_at IS NULL OR expires_at > now())
$$;

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
BEGIN
  IF _user_id IS NULL OR _hours IS NULL OR _hours <= 0 THEN
    RETURN 0;
  END IF;

  IF auth.uid() IS NOT NULL
     AND auth.uid() <> _user_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not permitted to spend another user''s prepaid hours';
  END IF;

  FOR lot IN
    SELECT id, hours_remaining
    FROM public.pack_lots
    WHERE user_id = _user_id
      AND status = 'active'
      AND hours_remaining > 0
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY expires_at NULLS LAST, purchased_at
    FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0;
    take := LEAST(lot.hours_remaining, remaining);

    UPDATE public.pack_lots
       SET hours_remaining = hours_remaining - take,
           status = CASE WHEN hours_remaining - take <= 0 THEN 'depleted' ELSE 'active' END,
           updated_at = now()
     WHERE id = lot.id;

    remaining := remaining - take;

    SELECT public.pack_hours_balance(_user_id) INTO bal;

    INSERT INTO public.pack_transactions
      (user_id, lot_id, hours, balance_after, transaction_type, related_booking_id, description)
    VALUES (_user_id, lot.id, -take, bal, _transaction_type, _booking_id, _description);
  END LOOP;

  RETURN _hours - remaining;
END;
$$;

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
BEGIN
  IF _user_id IS NULL OR _hours IS NULL OR _hours <= 0 THEN
    RETURN 0;
  END IF;

  IF auth.uid() IS NOT NULL
     AND auth.uid() <> _user_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not permitted to modify another user''s prepaid hours';
  END IF;

  FOR lot IN
    SELECT id, hours_total, hours_remaining
    FROM public.pack_lots
    WHERE user_id = _user_id
      AND status IN ('active', 'depleted')
      AND (expires_at IS NULL OR expires_at > now())
      AND hours_remaining < hours_total
    ORDER BY expires_at NULLS LAST, purchased_at
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

CREATE OR REPLACE FUNCTION public.redeem_pack_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  lot RECORD;
  bal numeric;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be signed in to redeem a pack.');
  END IF;

  SELECT * INTO lot
  FROM public.pack_lots
  WHERE upper(trim(redemption_code)) = upper(trim(_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'That code was not found.');
  END IF;

  IF lot.status <> 'unredeemed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'That code has already been used.');
  END IF;

  UPDATE public.pack_lots
     SET user_id = _uid,
         status = 'active',
         redeemed_at = now(),
         purchased_at = COALESCE(purchased_at, now()),
         expires_at = now() + (validity_days || ' days')::interval,
         updated_at = now()
   WHERE id = lot.id;

  SELECT public.pack_hours_balance(_uid) INTO bal;

  INSERT INTO public.pack_transactions
    (user_id, lot_id, hours, balance_after, transaction_type, description)
  VALUES (_uid, lot.id, lot.hours_remaining, bal, 'redeem',
          'Redeemed ' || lot.product_name || ' pack code');

  RETURN jsonb_build_object('success', true, 'hours', lot.hours_remaining, 'balance', bal);
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_pack_lots()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lot RECORD;
  n integer := 0;
BEGIN
  FOR lot IN
    SELECT id, user_id, hours_remaining, product_name
    FROM public.pack_lots
    WHERE status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at <= now()
    FOR UPDATE
  LOOP
    UPDATE public.pack_lots
       SET status = 'expired', hours_remaining = 0, updated_at = now()
     WHERE id = lot.id;

    IF lot.user_id IS NOT NULL AND lot.hours_remaining > 0 THEN
      INSERT INTO public.pack_transactions
        (user_id, lot_id, hours, balance_after, transaction_type, description)
      VALUES (lot.user_id, lot.id, -lot.hours_remaining,
              public.pack_hours_balance(lot.user_id), 'expired',
              lot.product_name || ' pack expired');
    END IF;

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

INSERT INTO public.pack_products (name, hours, price, validity_days, description, display_order)
VALUES ('Practice Pack', 5, 150, 90,
        'Perfect for casual golfers, people testing the venue, or as a gift.', 1);