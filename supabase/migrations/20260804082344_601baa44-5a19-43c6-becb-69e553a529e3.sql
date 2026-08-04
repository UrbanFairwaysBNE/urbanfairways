-- Recreate the missing signup trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for existing users without one
INSERT INTO public.profiles (user_id, email, first_name, last_name, phone)
SELECT u.id,
       u.email,
       COALESCE(u.raw_user_meta_data ->> 'first_name', ''),
       COALESCE(u.raw_user_meta_data ->> 'last_name', ''),
       u.raw_user_meta_data ->> 'phone'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id);

-- Make sam@baysidegolf.com.au an admin
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE lower(u.email) = 'sam@baysidegolf.com.au'
ON CONFLICT (user_id, role) DO NOTHING;