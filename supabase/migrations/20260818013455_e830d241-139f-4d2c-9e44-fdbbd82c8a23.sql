-- 1. Nicknames on tour members
ALTER TABLE public.sgt_tour_members ADD COLUMN IF NOT EXISTS nickname text;

-- 2. Pending-onboarding dismissal
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sgt_onboarding_dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sgt_onboarding_dismissed_by uuid;

-- 3. One SGT account can never attach to two profiles
DROP INDEX IF EXISTS public.idx_profiles_sgt_user_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_sgt_user_id_unique
  ON public.profiles (sgt_user_id) WHERE sgt_user_id IS NOT NULL;

-- 4. Ambrose debut-pairing / net-vs-par flags for the weekly recap
CREATE OR REPLACE FUNCTION public.local_comp_first_timer_flags(p_competition_id uuid)
RETURNS TABLE(
  team_id uuid,
  team_name text,
  player1_name text,
  player2_name text,
  player1_first_timer boolean,
  player2_first_timer boolean,
  debut_pairing boolean,
  net_score numeric,
  beat_par boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH comp AS (
    SELECT id, date, created_at, COALESCE(par, 72) AS par
    FROM (
      SELECT c.id, c.date, c.created_at, NULL::int AS par
      FROM public.local_competitions c
      WHERE c.id = p_competition_id
    ) x
  ),
  prior AS (
    SELECT lower(trim(t.player1_name)) AS n
    FROM public.local_comp_teams t
    JOIN public.local_competitions c2 ON c2.id = t.competition_id
    JOIN comp ON true
    WHERE t.competition_id <> p_competition_id
      AND (c2.date < comp.date OR (c2.date = comp.date AND c2.created_at < comp.created_at))
    UNION
    SELECT lower(trim(t.player2_name))
    FROM public.local_comp_teams t
    JOIN public.local_competitions c2 ON c2.id = t.competition_id
    JOIN comp ON true
    WHERE t.competition_id <> p_competition_id
      AND (c2.date < comp.date OR (c2.date = comp.date AND c2.created_at < comp.created_at))
  )
  SELECT
    t.id,
    t.team_name,
    t.player1_name,
    t.player2_name,
    NOT EXISTS (SELECT 1 FROM prior p WHERE p.n = lower(trim(t.player1_name))) AS player1_first_timer,
    NOT EXISTS (SELECT 1 FROM prior p WHERE p.n = lower(trim(t.player2_name))) AS player2_first_timer,
    (NOT EXISTS (SELECT 1 FROM prior p WHERE p.n = lower(trim(t.player1_name))))
      AND (NOT EXISTS (SELECT 1 FROM prior p WHERE p.n = lower(trim(t.player2_name)))) AS debut_pairing,
    t.net_score,
    (t.net_score IS NOT NULL AND t.net_score < (SELECT par FROM comp)) AS beat_par
  FROM public.local_comp_teams t
  WHERE t.competition_id = p_competition_id
$$;

GRANT EXECUTE ON FUNCTION public.local_comp_first_timer_flags(uuid) TO authenticated, service_role;

-- 5. Point the SGT triggers at THIS project (they still referenced the source project)
CREATE OR REPLACE FUNCTION public.trigger_sgt_auto_register_on_tour_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM net.http_post(
      url := 'https://gtzmjckudtjctiztsgzw.supabase.co/functions/v1/sgt-auto-register',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('sgt_user_id', NEW.user_id)
    );
    RAISE LOG '[SGT-AUTO-REG] Triggered for sgt_user_id: % on tour: %', NEW.user_id, NEW.tour_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_sgt_sync_on_membership_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_grants boolean;
  old_grants boolean;
BEGIN
  SELECT COALESCE(grants_league_access, false) INTO new_grants
  FROM public.pricing_config WHERE lower(tier) = lower(NEW.membership_tier);

  SELECT COALESCE(grants_league_access, false) INTO old_grants
  FROM public.pricing_config WHERE lower(tier) = lower(COALESCE(OLD.membership_tier, ''));

  IF COALESCE(new_grants, false) AND NOT COALESCE(old_grants, false) THEN
    PERFORM net.http_post(
      url := 'https://gtzmjckudtjctiztsgzw.supabase.co/functions/v1/sgt-sync-eligible',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('trigger', 'membership_activation', 'user_id', NEW.user_id)
    );
  END IF;
  RETURN NEW;
END;
$function$;