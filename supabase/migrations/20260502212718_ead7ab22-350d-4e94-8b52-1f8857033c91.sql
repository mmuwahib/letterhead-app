INSERT INTO public.user_roles (user_id, role)
VALUES ('72aea82b-0ee7-4404-9ccb-40a850eda1dd', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles
SET approved_at = COALESCE(approved_at, now()),
    banned_at = NULL
WHERE user_id = '72aea82b-0ee7-4404-9ccb-40a850eda1dd';