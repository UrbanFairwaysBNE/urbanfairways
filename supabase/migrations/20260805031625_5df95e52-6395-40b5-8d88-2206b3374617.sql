ALTER TABLE public.profiles ALTER COLUMN membership_tier SET DEFAULT 'casual';
UPDATE public.profiles SET membership_tier = 'casual' WHERE membership_tier = 'visitor' OR membership_tier IS NULL;