ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status text
    CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

COMMENT ON COLUMN public.profiles.verification_status IS 'Admin review state for tiers requiring verification (e.g. frontline). Set to pending on signup, approved/rejected from the admin customer profile.';