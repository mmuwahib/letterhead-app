-- Fix over-permissive RLS: user_in_scope incorrectly returns true for all scopes
-- because every regular user has a global-scope entry in user_roles via handle_new_user.
-- Restrict scope-grant logic so the default 'user' role's global entry doesn't grant
-- broad cross-scope access. Real scope grants must come from user_role_assignments
-- or from elevated roles (admin/manager) in user_roles.

CREATE OR REPLACE FUNCTION public.user_in_scope(_user_id uuid, _scope_type text, _scope_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_role_assignments a
    JOIN public.role_definitions r ON r.id = a.role_definition_id
    WHERE a.user_id = _user_id
      AND (
        r.scope_type = 'global'
        OR (r.scope_type = _scope_type AND r.scope_id = _scope_id)
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin'::public.app_role, 'manager'::public.app_role)
      AND (
        ur.scope_type = 'global'
        OR (ur.scope_type = _scope_type AND ur.scope_id = _scope_id)
      )
  );
$function$;

-- Also tighten user_has_permission: 'view_archive' and 'upload' should NOT
-- automatically extend cross-scope visibility for every active user.
-- We keep upload/view_archive as a baseline capability for active users
-- (so users can still upload and view their OWN docs via the "Users can view own documents" policy),
-- but we replace the over-broad "Scoped viewers can view documents" policy with one
-- that requires an explicit role assignment granting view_archive at a real scope.

DROP POLICY IF EXISTS "Scoped viewers can view documents" ON public.documents;

CREATE POLICY "Scoped viewers can view documents"
ON public.documents
FOR SELECT
TO authenticated
USING (
  is_active_user(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.user_role_assignments a
    JOIN public.role_definitions r ON r.id = a.role_definition_id
    WHERE a.user_id = auth.uid()
      AND COALESCE((r.permissions ->> 'view_archive')::boolean, false) = true
      AND (
        (r.scope_type = 'legal_entity' AND r.scope_id = documents.legal_entity_id)
        OR (r.scope_type = 'site' AND r.scope_id = documents.office_site_id)
        OR (r.scope_type = 'department' AND r.scope_id = documents.department_id)
        OR r.scope_type = 'global'
      )
  )
);

-- Same fix for activity_logs
DROP POLICY IF EXISTS "Scoped viewers can view logs" ON public.activity_logs;

CREATE POLICY "Scoped viewers can view logs"
ON public.activity_logs
FOR SELECT
TO authenticated
USING (
  is_active_user(auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.user_role_assignments a
    JOIN public.role_definitions r ON r.id = a.role_definition_id
    WHERE a.user_id = auth.uid()
      AND COALESCE((r.permissions ->> 'view_logs')::boolean, false) = true
      AND (
        (r.scope_type = 'legal_entity' AND r.scope_id = activity_logs.legal_entity_id)
        OR (r.scope_type = 'site' AND r.scope_id = activity_logs.office_site_id)
        OR (r.scope_type = 'department' AND r.scope_id = activity_logs.department_id)
        OR r.scope_type = 'global'
      )
  )
);