-- Enforce case-insensitive uniqueness on profile full names.
-- Email uniqueness is already guaranteed by auth.users.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_full_name_lower_uniq
ON public.profiles (lower(btrim(full_name)))
WHERE full_name IS NOT NULL AND length(btrim(full_name)) > 0;
