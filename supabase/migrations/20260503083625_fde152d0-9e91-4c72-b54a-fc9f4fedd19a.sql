-- Add optional scoping to user_roles so a user can hold a role
-- restricted to a specific legal entity or site. Default scope remains
-- 'global' which preserves all existing behavior.

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS scope_type text NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS scope_id uuid;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_role_scope_uniq
  ON public.user_roles (user_id, role, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Allow whitelist of values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_scope_type_check'
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_scope_type_check
      CHECK (scope_type IN ('global','legal_entity','site','department'));
  END IF;
END $$;

-- Scoped role helper. Returns true if user has the given role either
-- globally or scoped to the provided (scope_type, scope_id) pair.
CREATE OR REPLACE FUNCTION public.has_role_scoped(
  _user_id uuid,
  _role public.app_role,
  _scope_type text,
  _scope_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (
        scope_type = 'global'
        OR (scope_type = _scope_type AND scope_id = _scope_id)
      )
  )
$$;