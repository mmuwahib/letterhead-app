
-- Helper: does the user have any role assignment whose scope covers the row?
CREATE OR REPLACE FUNCTION public.user_in_scope(_user_id uuid, _scope_type text, _scope_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
      AND (
        ur.scope_type = 'global'
        OR (ur.scope_type = _scope_type AND ur.scope_id = _scope_id)
      )
  );
$$;

-- =========================================================
-- documents
-- =========================================================
DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
DROP POLICY IF EXISTS "Managers can view department documents" ON public.documents;
DROP POLICY IF EXISTS "Admins can view all documents" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can insert documents" ON public.documents;

CREATE POLICY "Admins can view all documents"
ON public.documents FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users can view own documents"
ON public.documents FOR SELECT TO authenticated
USING (auth.uid() = user_id AND public.is_active_user(auth.uid()));

CREATE POLICY "Scoped viewers can view documents"
ON public.documents FOR SELECT TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND public.user_has_permission(auth.uid(), 'view_archive')
  AND (
    public.user_in_scope(auth.uid(), 'legal_entity', legal_entity_id)
    OR public.user_in_scope(auth.uid(), 'site', office_site_id)
    OR public.user_in_scope(auth.uid(), 'department', department_id)
  )
);

CREATE POLICY "Managers can view department documents"
ON public.documents FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND department_id = public.get_user_department(auth.uid())
  AND public.is_active_user(auth.uid())
);

CREATE POLICY "Permitted users can insert documents"
ON public.documents FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.is_active_user(auth.uid())
  AND public.user_has_permission(auth.uid(), 'upload')
);

-- =========================================================
-- letterhead_templates
-- =========================================================
DROP POLICY IF EXISTS "Admins can insert templates" ON public.letterhead_templates;
DROP POLICY IF EXISTS "Admins can update templates" ON public.letterhead_templates;
DROP POLICY IF EXISTS "Admins can delete templates" ON public.letterhead_templates;

CREATE POLICY "Permitted users can insert templates"
ON public.letterhead_templates FOR INSERT TO authenticated
WITH CHECK (public.user_has_permission(auth.uid(), 'manage_templates'));

CREATE POLICY "Permitted users can update templates"
ON public.letterhead_templates FOR UPDATE TO authenticated
USING (public.user_has_permission(auth.uid(), 'manage_templates'))
WITH CHECK (public.user_has_permission(auth.uid(), 'manage_templates'));

CREATE POLICY "Permitted users can delete templates"
ON public.letterhead_templates FOR DELETE TO authenticated
USING (public.user_has_permission(auth.uid(), 'manage_templates'));

-- =========================================================
-- activity_logs
-- =========================================================
DROP POLICY IF EXISTS "Admins can view all logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Managers can view department logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can view own logs" ON public.activity_logs;

CREATE POLICY "Admins can view all logs"
ON public.activity_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users can view own logs"
ON public.activity_logs FOR SELECT TO authenticated
USING (auth.uid() = user_id AND public.is_active_user(auth.uid()));

CREATE POLICY "Managers can view department logs"
ON public.activity_logs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND department_id = public.get_user_department(auth.uid())
  AND public.is_active_user(auth.uid())
);

CREATE POLICY "Scoped viewers can view logs"
ON public.activity_logs FOR SELECT TO authenticated
USING (
  public.is_active_user(auth.uid())
  AND public.user_has_permission(auth.uid(), 'view_logs')
  AND (
    public.user_in_scope(auth.uid(), 'legal_entity', legal_entity_id)
    OR public.user_in_scope(auth.uid(), 'site', office_site_id)
    OR public.user_in_scope(auth.uid(), 'department', department_id)
  )
);
