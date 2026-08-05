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
      AND lower(p.membership_tier::text) NOT IN ('casual', 'visitor')
  )
$$;