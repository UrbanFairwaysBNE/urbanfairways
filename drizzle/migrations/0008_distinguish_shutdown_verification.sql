CREATE OR REPLACE FUNCTION public.bay_log_health_metric(_type text, _level text, _msg text, _details jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
SELECT CASE
 WHEN _type='error' AND _msg = 'Simulator shutdown verification unavailable' THEN 'close_unverified'
 WHEN _type='error' AND _msg = 'Simulator shutdown failed: processes still running' THEN 'close_fail'
 WHEN _type='error' AND _msg ILIKE 'closeApps returned success=false%' THEN
   CASE
    WHEN jsonb_typeof(_details->'stillRunning')='array' AND _details->'stillRunning' <> '[]'::jsonb THEN 'close_fail'
    WHEN _details->'verificationSucceeded'='true'::jsonb AND _details->'stillRunning'='[]'::jsonb THEN NULL
    ELSE 'close_unverified'
   END
 ELSE public.bay_log_health_metric(_type,_level,_msg)
END
$$;
REVOKE ALL ON FUNCTION public.bay_log_health_metric(text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bay_log_health_metric(text,text,text,jsonb) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.rollup_bay_log_health()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _d date; _m text;
BEGIN
 IF NEW.bay_number IS NULL THEN RETURN NEW; END IF;
 _d := (NEW.created_at AT TIME ZONE 'Australia/Brisbane')::date;
 _m := public.bay_log_health_metric(NEW.event_type, NEW.event_level, NEW.message, NEW.details);
 INSERT INTO public.bay_health_daily(day,bay_number,metric,value) VALUES (_d,NEW.bay_number,'events',1)
 ON CONFLICT(day,bay_number,metric) DO UPDATE SET value=bay_health_daily.value+1;
 IF _m IS NOT NULL THEN
  INSERT INTO public.bay_health_daily(day,bay_number,metric,value) VALUES (_d,NEW.bay_number,_m,1)
  ON CONFLICT(day,bay_number,metric) DO UPDATE SET value=bay_health_daily.value+1;
 END IF;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;