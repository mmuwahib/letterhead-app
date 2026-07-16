
CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR (
      _permission IN ('upload','view_archive')
      AND public.is_active_user(_user_id)
    )
    OR (
      _permission IN ('manage_templates','view_logs')
      AND public.has_role(_user_id, 'manager'::public.app_role)
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_role_assignments a
      JOIN public.role_definitions r ON r.id = a.role_definition_id
      WHERE a.user_id = _user_id
        AND COALESCE((r.permissions ->> _permission)::boolean, false) = true
    );
$$;
