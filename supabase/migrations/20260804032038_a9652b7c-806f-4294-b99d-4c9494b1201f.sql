-- 1. Data-driven membership check (walk-in tier comes from pricing_config)
CREATE OR REPLACE FUNCTION public.is_paying_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _user_id
      AND COALESCE(p.membership_tier::text, '') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.pricing_config pc
        WHERE lower(pc.tier) = lower(p.membership_tier::text)
          AND pc.is_default = true
      )
      AND lower(p.membership_tier::text) <> 'visitor'
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_paying_member(uuid) TO authenticated, service_role;

-- 2. Recreate the policies that referenced the tier column directly
DROP POLICY IF EXISTS "Members can create comments" ON public.clubhouse_comments;
DROP POLICY IF EXISTS "Members can view comments" ON public.clubhouse_comments;
DROP POLICY IF EXISTS "Members can create posts" ON public.clubhouse_posts;
DROP POLICY IF EXISTS "Members can view posts" ON public.clubhouse_posts;
DROP POLICY IF EXISTS "Members can create upvotes" ON public.clubhouse_upvotes;
DROP POLICY IF EXISTS "Members can view upvotes" ON public.clubhouse_upvotes;
DROP POLICY IF EXISTS "Users can view applicable announcements" ON public.announcements;
DROP POLICY IF EXISTS "Members can upload clubhouse images" ON storage.objects;

-- 3. Tier keys must be venue-defined, not a fixed enum of the old venue's tier names
DROP TRIGGER IF EXISTS trg_log_membership_tier_change ON public.profiles;
DROP TRIGGER IF EXISTS trg_sgt_sync_on_membership_activation ON public.profiles;

ALTER TABLE public.profiles ALTER COLUMN membership_tier DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN membership_tier TYPE text USING membership_tier::text;
ALTER TABLE public.profiles ALTER COLUMN membership_tier SET DEFAULT 'visitor';

DROP TYPE IF EXISTS public.membership_tier;

-- 4. Recreate policies using the data-driven helper
CREATE POLICY "Members can create comments" ON public.clubhouse_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_paying_member(auth.uid()));

CREATE POLICY "Members can view comments" ON public.clubhouse_comments
  FOR SELECT TO authenticated
  USING (public.is_paying_member(auth.uid()));

CREATE POLICY "Members can create posts" ON public.clubhouse_posts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_paying_member(auth.uid()));

CREATE POLICY "Members can view posts" ON public.clubhouse_posts
  FOR SELECT TO authenticated
  USING (public.is_paying_member(auth.uid()));

CREATE POLICY "Members can create upvotes" ON public.clubhouse_upvotes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_paying_member(auth.uid()));

CREATE POLICY "Members can view upvotes" ON public.clubhouse_upvotes
  FOR SELECT TO authenticated
  USING (public.is_paying_member(auth.uid()));

CREATE POLICY "Users can view applicable announcements" ON public.announcements
  FOR SELECT
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (members_only = false OR public.is_paying_member(auth.uid()))
  );

CREATE POLICY "Members can upload clubhouse images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'clubhouse-images' AND public.is_paying_member(auth.uid()));

-- 5. League eligibility reads the tier's grants_league_access flag
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
      url := 'https://rgqiiltnkunfxncimfbq.supabase.co/functions/v1/sgt-sync-eligible',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('trigger', 'membership_activation', 'user_id', NEW.user_id)
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_log_membership_tier_change
  AFTER UPDATE OF membership_tier ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_membership_tier_change();

CREATE TRIGGER trg_sgt_sync_on_membership_activation
  AFTER UPDATE OF membership_tier ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trigger_sgt_sync_on_membership_activation();