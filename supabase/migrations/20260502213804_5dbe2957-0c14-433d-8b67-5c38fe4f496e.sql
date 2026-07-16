UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email = 'muwahib@gmail.com';

INSERT INTO public.profiles (user_id, full_name, approved_at, onboarded)
SELECT id, COALESCE(raw_user_meta_data->>'full_name', email), now(), true
FROM auth.users WHERE email = 'muwahib@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET approved_at = COALESCE(public.profiles.approved_at, now()), banned_at = NULL, onboarded = true;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users WHERE email = 'muwahib@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles
WHERE role <> 'admin'
  AND user_id = (SELECT id FROM auth.users WHERE email = 'muwahib@gmail.com');
