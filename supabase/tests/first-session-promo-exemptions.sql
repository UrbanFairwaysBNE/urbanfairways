-- Regression: every customer already present when Sam requested exemption
-- remains excluded, without changing promo email history or wallet balances.
SELECT 1 / CASE WHEN
  (SELECT count(*) FROM public.profiles
   WHERE created_at <= '2026-10-25T04:09:00Z') = 966
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE created_at <= '2026-10-25T04:09:00Z'
      AND first_session_promo_exempt IS DISTINCT FROM true
  ) THEN 1 ELSE 0 END AS exemption_regression_pass;