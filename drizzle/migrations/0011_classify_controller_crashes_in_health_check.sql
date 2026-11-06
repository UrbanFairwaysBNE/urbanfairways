CREATE OR REPLACE FUNCTION public.bay_log_health_metric(_type text, _level text, _msg text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _type='process_detection' AND _msg ILIKE '[Lifecycle] controller_crash_detected%' THEN 'controller_crash'
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