CREATE OR REPLACE FUNCTION public.redeem_pack_code(_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  RETURN jsonb_build_object('success', true, 'hours', lot.hours_remaining, 'balance', bal, 'lot_id', lot.id);
END;
$function$;