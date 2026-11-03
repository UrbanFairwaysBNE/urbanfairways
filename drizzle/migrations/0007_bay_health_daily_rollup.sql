CREATE TABLE public.bay_health_daily (
  day date NOT NULL,
  bay_number int NOT NULL,
  metric text NOT NULL,
  value bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (day, bay_number, metric)
);
GRANT SELECT ON public.bay_health_daily TO authenticated;
GRANT ALL ON public.bay_health_daily TO service_role;
ALTER TABLE public.bay_health_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read bay health" ON public.bay_health_daily FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.bay_log_health_metric(_type text, _level text, _msg text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN _type='error' AND _msg ILIKE 'closeApps returned success=false%' THEN 'close_fail'
    WHEN _type='plug_control_result' AND _level='warning' THEN 'plug_fail'
    WHEN _type='process_detection' AND _level='error' AND _msg ILIKE 'Display guard%' THEN 'display_fail'
    WHEN _type='app_close_unexpected' THEN 'unexpected_close'
    WHEN _type='app_launch' THEN 'app_launch'
    WHEN _msg ILIKE '%Upload FAILED%' THEN 'settings_upload_fail'
    WHEN _msg ILIKE '%PLUG-OFF BLOCKED%' OR _msg ILIKE '%still alive%retry%' THEN 'shutdown_loop'
    WHEN _msg ILIKE '%forc%power%' OR _msg ILIKE '%forced%off%' THEN 'forced_off'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.rollup_bay_log_health()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _d date; _m text;
BEGIN
  IF NEW.bay_number IS NULL THEN RETURN NEW; END IF;
  _d := (NEW.created_at AT TIME ZONE 'Australia/Brisbane')::date;
  _m := public.bay_log_health_metric(NEW.event_type, NEW.event_level, NEW.message);
  INSERT INTO public.bay_health_daily(day, bay_number, metric, value) VALUES (_d, NEW.bay_number, 'events', 1)
    ON CONFLICT (day, bay_number, metric) DO UPDATE SET value = bay_health_daily.value + 1;
  IF _m IS NOT NULL THEN
    INSERT INTO public.bay_health_daily(day, bay_number, metric, value) VALUES (_d, NEW.bay_number, _m, 1)
      ON CONFLICT (day, bay_number, metric) DO UPDATE SET value = bay_health_daily.value + 1;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- never block controller logging
END;
$$;

CREATE TRIGGER trg_rollup_bay_log_health AFTER INSERT ON public.bay_controller_logs
  FOR EACH ROW EXECUTE FUNCTION public.rollup_bay_log_health();

CREATE OR REPLACE FUNCTION public.platform_health(_days int DEFAULT 7)
RETURNS TABLE(day date, category text, subject text, metric text, value numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _start date := (now() AT TIME ZONE 'Australia/Brisbane')::date - (LEAST(GREATEST(_days,1),31) - 1);
  _since timestamptz := (_start::timestamp AT TIME ZONE 'Australia/Brisbane');
  _today date := (now() AT TIME ZONE 'Australia/Brisbane')::date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT h.day, 'bays'::text, 'Bay ' || h.bay_number, h.metric, h.value::numeric
  FROM bay_health_daily h WHERE h.day >= _start
  UNION ALL
  SELECT b.booking_date, 'bays', by.name, 'bookings', count(*)::numeric
  FROM bookings b JOIN bays by ON by.id=b.bay_id
  WHERE b.booking_date >= _start AND b.booking_date <= _today AND b.status='confirmed'
    AND (b.booking_date + b.start_time) < (now() AT TIME ZONE 'Australia/Brisbane')
  GROUP BY 1,3
  UNION ALL
  SELECT r.session_date, 'bays', by.name, 'range_sessions', count(*)::numeric
  FROM range_sessions r JOIN bays by ON by.id=r.bay_id
  WHERE r.session_date >= _start GROUP BY 1,3
  UNION ALL
  SELECT b.booking_date, 'bookings', 'all', 'confirmed', count(*)::numeric
  FROM bookings b WHERE b.booking_date >= _start AND b.booking_date <= _today AND b.status='confirmed' GROUP BY 1
  UNION ALL
  SELECT (b.created_at AT TIME ZONE 'Australia/Brisbane')::date, 'bookings', 'all', 'stuck_pending', count(*)::numeric
  FROM bookings b WHERE b.status='pending' AND b.created_at < now() - interval '10 minutes' AND b.created_at >= _since GROUP BY 1
  UNION ALL
  SELECT a.booking_date, 'bookings', 'all', 'overlaps', count(*)::numeric
  FROM bookings a JOIN bookings c ON c.bay_id=a.bay_id AND c.booking_date=a.booking_date AND c.id>a.id
    AND c.status='confirmed' AND a.start_time < c.end_time AND a.end_time > c.start_time
  WHERE a.status='confirmed' AND a.booking_date >= _start AND a.booking_date <= _today GROUP BY 1
  UNION ALL
  SELECT b.booking_date, 'bookings', 'all', 'unpaid_finished', count(*)::numeric
  FROM bookings b WHERE b.status='confirmed' AND b.booking_date >= _start
    AND b.stripe_payment_intent_id IS NULL
    AND COALESCE(b.payment_method,'pending') NOT IN ('card','balance','cash','prepaid_hours','free')
    AND (b.booking_date + b.end_time) < (now() AT TIME ZONE 'Australia/Brisbane')
  GROUP BY 1
  UNION ALL
  SELECT (n.created_at AT TIME ZONE 'Australia/Brisbane')::date, 'emails', 'booking', n.status, count(*)::numeric
  FROM booking_notification_log n WHERE n.created_at >= _since GROUP BY 1,4
  UNION ALL
  SELECT (b.created_at AT TIME ZONE 'Australia/Brisbane')::date, 'payments', 'all', 'card_bookings', count(*)::numeric
  FROM bookings b WHERE b.stripe_payment_intent_id IS NOT NULL AND b.created_at >= _since GROUP BY 1
  UNION ALL
  SELECT (mp.paid_at AT TIME ZONE 'Australia/Brisbane')::date, 'payments', 'all', 'membership_payments', count(*)::numeric
  FROM membership_payments mp WHERE mp.paid_at >= _since GROUP BY 1
  UNION ALL
  SELECT (p.payment_failed_at AT TIME ZONE 'Australia/Brisbane')::date, 'payments', 'all', 'membership_failed', count(*)::numeric
  FROM profiles p WHERE p.payment_failed_at >= _since GROUP BY 1
  UNION ALL
  SELECT (pl.created_at AT TIME ZONE 'Australia/Brisbane')::date, 'payments', 'all', 'pack_sales', count(*)::numeric
  FROM pack_lots pl WHERE pl.created_at >= _since AND pl.price_paid > 0 GROUP BY 1
  UNION ALL
  SELECT _today, 'memberships', 'all', 'payment_flagged', count(*)::numeric FROM profiles p WHERE p.payment_failed_at IS NOT NULL
  UNION ALL
  SELECT _today, 'memberships', 'all', 'verification_overdue', count(*)::numeric
  FROM profiles p WHERE p.verification_status='pending' AND p.updated_at < now() - interval '3 days'
  UNION ALL
  SELECT _today, 'memberships', 'all', 'verification_pending', count(*)::numeric FROM profiles p WHERE p.verification_status='pending'
  UNION ALL
  SELECT (e.created_at AT TIME ZONE 'Australia/Brisbane')::date, 'door', 'all', e.event_type, count(*)::numeric
  FROM door_code_events e WHERE e.created_at >= _since GROUP BY 1,4
  UNION ALL
  SELECT (d.updated_at AT TIME ZONE 'Australia/Brisbane')::date, 'door', 'all', 'code_errors', count(*)::numeric
  FROM door_codes d WHERE d.last_error IS NOT NULL AND d.updated_at >= _since GROUP BY 1
  UNION ALL
  SELECT _today, 'packs', 'all', 'negative_balance', count(*)::numeric FROM pack_lots pl WHERE pl.hours_remaining < 0
  UNION ALL
  SELECT _today, 'packs', 'all', 'overdue_expiry', count(*)::numeric
  FROM pack_lots pl WHERE pl.status='active' AND pl.expires_at < now() - interval '1 day';
END;
$$;