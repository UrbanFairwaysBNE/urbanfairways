CREATE TABLE public.bay_shutdown_health_reports (
 log_id uuid PRIMARY KEY, bay_number integer NOT NULL, booking_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL, kind text NOT NULL CHECK(kind IN ('warning','closed')), resolved boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.bay_shutdown_health_reports TO authenticated;
GRANT ALL ON public.bay_shutdown_health_reports TO service_role;
ALTER TABLE public.bay_shutdown_health_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read shutdown reports" ON public.bay_shutdown_health_reports FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE INDEX bay_shutdown_health_match ON public.bay_shutdown_health_reports(bay_number,booking_id,occurred_at);
CREATE OR REPLACE FUNCTION public.reconcile_bay_shutdown_health() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _kind text; _time timestamptz; _r record;
BEGIN
 IF NEW.bay_number IS NULL OR NEW.booking_id IS NULL THEN RETURN NEW; END IF;
 IF public.bay_log_health_metric(NEW.event_type,NEW.event_level,NEW.message,NEW.details)='close_unverified' THEN _kind:='warning';
 ELSIF NEW.event_type='process_detection' AND (NEW.message='Post-close verification: all processes confirmed dead' OR NEW.message='[Changeover Step 2] Post-close: all processes confirmed dead') AND COALESCE(NEW.details->'verificationSucceeded','true'::jsonb)<>'false'::jsonb AND COALESCE(NEW.details->'stillRunning','[]'::jsonb)='[]'::jsonb THEN _kind:='closed';
 ELSE RETURN NEW; END IF;
 _time:=COALESCE((NEW.details->>'local_timestamp')::timestamptz,NEW.created_at);
 PERFORM pg_advisory_xact_lock(74001,NEW.bay_number);
 INSERT INTO bay_shutdown_health_reports(log_id,bay_number,booking_id,occurred_at,kind) VALUES(NEW.id,NEW.bay_number,NEW.booking_id,_time,_kind) ON CONFLICT DO NOTHING;
 FOR _r IN UPDATE bay_shutdown_health_reports w SET resolved=true WHERE w.kind='warning' AND NOT w.resolved AND w.bay_number=NEW.bay_number AND w.booking_id=NEW.booking_id AND EXISTS(SELECT 1 FROM bay_shutdown_health_reports c WHERE c.kind='closed' AND c.bay_number=w.bay_number AND c.booking_id=w.booking_id AND c.occurred_at BETWEEN w.occurred_at-interval '2 seconds' AND w.occurred_at+interval '30 seconds') RETURNING w.* LOOP
 INSERT INTO bay_health_daily(day,bay_number,metric,value) VALUES((_r.occurred_at AT TIME ZONE 'Australia/Brisbane')::date,_r.bay_number,'close_recovered',1) ON CONFLICT(day,bay_number,metric) DO UPDATE SET value=bay_health_daily.value+1;
 END LOOP;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.reconcile_bay_shutdown_health() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER z_reconcile_bay_shutdown_health AFTER INSERT ON public.bay_controller_logs FOR EACH ROW EXECUTE FUNCTION public.reconcile_bay_shutdown_health();
INSERT INTO public.bay_shutdown_health_reports(log_id,bay_number,booking_id,occurred_at,kind)
SELECT id,bay_number,booking_id,COALESCE((details->>'local_timestamp')::timestamptz,created_at),CASE WHEN event_type='error' THEN 'warning' ELSE 'closed' END
FROM public.bay_controller_logs WHERE created_at >= ((now() AT TIME ZONE 'Australia/Brisbane')::date-6)::timestamp AT TIME ZONE 'Australia/Brisbane' AND bay_number IS NOT NULL AND booking_id IS NOT NULL AND (
 (event_type='error' AND public.bay_log_health_metric(event_type,event_level,message,details)='close_unverified') OR
 (event_type='process_detection' AND message IN ('Post-close verification: all processes confirmed dead','[Changeover Step 2] Post-close: all processes confirmed dead') AND COALESCE(details->'verificationSucceeded','true'::jsonb)<>'false'::jsonb AND COALESCE(details->'stillRunning','[]'::jsonb)='[]'::jsonb));
UPDATE public.bay_shutdown_health_reports w SET resolved=true WHERE w.kind='warning' AND EXISTS(SELECT 1 FROM public.bay_shutdown_health_reports c WHERE c.kind='closed' AND c.bay_number=w.bay_number AND c.booking_id=w.booking_id AND c.occurred_at BETWEEN w.occurred_at-interval '2 seconds' AND w.occurred_at+interval '30 seconds');
INSERT INTO public.bay_health_daily(day,bay_number,metric,value) SELECT (occurred_at AT TIME ZONE 'Australia/Brisbane')::date,bay_number,'close_recovered',count(*) FROM public.bay_shutdown_health_reports WHERE resolved GROUP BY 1,2 ON CONFLICT(day,bay_number,metric) DO UPDATE SET value=excluded.value;