CREATE OR REPLACE FUNCTION public.platform_health(_days int DEFAULT 7)
RETURNS TABLE(day date, category text, subject text, metric text, value numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _start date := (now() AT TIME ZONE 'Australia/Brisbane')::date - (LEAST(GREATEST(_days,1),31) - 1);
  _since timestamptz := (_start::timestamp AT TIME ZONE 'Australia/Brisbane');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  -- Bay controller log metrics
  SELECT (l.created_at AT TIME ZONE 'Australia/Brisbane')::date, 'bays'::text, 'Bay ' || l.bay_number, m.metric, count(*)::numeric
  FROM bay_controller_logs l
  CROSS JOIN LATERAL (VALUES
    (CASE WHEN true THEN 'events' END),
    (CASE WHEN l.event_type='error' AND l.message ILIKE 'closeApps returned success=false%' THEN 'close_fail' END),
    (CASE WHEN l.event_type='plug_control_result' AND l.event_level='warning' THEN 'plug_fail' END),
    (CASE WHEN l.event_type='process_detection' AND l.event_level='error' AND l.message ILIKE 'Display guard%' THEN 'display_fail' END),
    (CASE WHEN l.event_type='app_close_unexpected' THEN 'unexpected_close' END),
    (CASE WHEN l.message ILIKE '%Upload FAILED%' THEN 'settings_upload_fail' END),
    (CASE WHEN l.message ILIKE '%PLUG-OFF BLOCKED%' OR l.message ILIKE '%still alive%retry%' THEN 'shutdown_loop' END),
    (CASE WHEN l.message ILIKE '%forc%power%' OR l.message ILIKE '%forced%off%' THEN 'forced_off' END),
    (CASE WHEN l.event_type='app_launch' THEN 'app_launch' END)
  ) AS m(metric)
  WHERE l.created_at >= _since AND l.bay_number IS NOT NULL AND m.metric IS NOT NULL
  GROUP BY 1,3,4

  UNION ALL
  -- Bookings per bay (for silent-controller and UF Lab checks)
  SELECT b.booking_date, 'bays', by.name, 'bookings', count(*)::numeric
  FROM bookings b JOIN bays by ON by.id=b.bay_id
  WHERE b.booking_date >= _start AND b.status='confirmed'
  GROUP BY 1,3

  UNION ALL
  SELECT r.session_date, 'bays', by.name, 'range_sessions', count(*)::numeric
  FROM range_sessions r JOIN bays by ON by.id=r.bay_id
  WHERE r.session_date >= _start GROUP BY 1,3

  UNION ALL
  -- Booking checks
  SELECT b.booking_date, 'bookings', 'all', 'confirmed', count(*)::numeric
  FROM bookings b WHERE b.booking_date >= _start AND b.status='confirmed' GROUP BY 1
  UNION ALL
  SELECT (b.created_at AT TIME ZONE 'Australia/Brisbane')::date, 'bookings', 'all', 'stuck_pending', count(*)::numeric
  FROM bookings b WHERE b.status='pending' AND b.created_at < now() - interval '10 minutes' AND b.created_at >= _since GROUP BY 1
  UNION ALL
  SELECT a.booking_date, 'bookings', 'all', 'overlaps', count(*)::numeric
  FROM bookings a JOIN bookings c ON c.bay_id=a.bay_id AND c.booking_date=a.booking_date AND c.id>a.id
    AND c.status='confirmed' AND a.start_time < c.end_time AND a.end_time > c.start_time
  WHERE a.status='confirmed' AND a.booking_date >= _start GROUP BY 1
  UNION ALL
  SELECT b.booking_date, 'bookings', 'all', 'unpaid_finished', count(*)::numeric
  FROM bookings b WHERE b.status='confirmed' AND b.booking_date >= _start
    AND b.stripe_payment_intent_id IS NULL
    AND COALESCE(b.payment_method,'pending') NOT IN ('card','balance','cash','prepaid_hours','free')
    AND (b.booking_date + b.end_time) < (now() AT TIME ZONE 'Australia/Brisbane')
  GROUP BY 1

  UNION ALL
  -- Notifications
  SELECT (n.created_at AT TIME ZONE 'Australia/Brisbane')::date, 'emails', 'booking', n.status, count(*)::numeric
  FROM booking_notification_log n WHERE n.created_at >= _since GROUP BY 1,4

  UNION ALL
  -- Payments
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
  -- Memberships (current snapshot, reported on today)
  SELECT (now() AT TIME ZONE 'Australia/Brisbane')::date, 'memberships', 'all', 'payment_flagged', count(*)::numeric
  FROM profiles p WHERE p.payment_failed_at IS NOT NULL
  UNION ALL
  SELECT (now() AT TIME ZONE 'Australia/Brisbane')::date, 'memberships', 'all', 'verification_overdue', count(*)::numeric
  FROM profiles p WHERE p.verification_status='pending' AND p.updated_at < now() - interval '3 days'
  UNION ALL
  SELECT (now() AT TIME ZONE 'Australia/Brisbane')::date, 'memberships', 'all', 'verification_pending', count(*)::numeric
  FROM profiles p WHERE p.verification_status='pending'

  UNION ALL
  -- Door access
  SELECT (e.created_at AT TIME ZONE 'Australia/Brisbane')::date, 'door', 'all', e.event_type, count(*)::numeric
  FROM door_code_events e WHERE e.created_at >= _since GROUP BY 1,4
  UNION ALL
  SELECT (d.updated_at AT TIME ZONE 'Australia/Brisbane')::date, 'door', 'all', 'code_errors', count(*)::numeric
  FROM door_codes d WHERE d.last_error IS NOT NULL AND d.updated_at >= _since GROUP BY 1

  UNION ALL
  -- Packs (snapshot)
  SELECT (now() AT TIME ZONE 'Australia/Brisbane')::date, 'packs', 'all', 'negative_balance', count(*)::numeric
  FROM pack_lots pl WHERE pl.hours_remaining < 0
  UNION ALL
  SELECT (now() AT TIME ZONE 'Australia/Brisbane')::date, 'packs', 'all', 'overdue_expiry', count(*)::numeric
  FROM pack_lots pl WHERE pl.status='active' AND pl.expires_at < now() - interval '1 day';
END;
$$;
REVOKE ALL ON FUNCTION public.platform_health(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_health(int) TO authenticated;