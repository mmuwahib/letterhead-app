-- Security hardening per scanner findings.

-- 1) Restrict reference-table SELECT to active users (was USING true).
DROP POLICY IF EXISTS "Authenticated users can read departments" ON public.departments;
CREATE POLICY "Active users can read departments"
ON public.departments FOR SELECT TO authenticated
USING (public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read legal entities" ON public.legal_entities;
CREATE POLICY "Active users can read legal entities"
ON public.legal_entities FOR SELECT TO authenticated
USING (public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read office sites" ON public.office_sites;
CREATE POLICY "Active users can read office sites"
ON public.office_sites FOR SELECT TO authenticated
USING (public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read serial_counters" ON public.serial_counters;
CREATE POLICY "Active users can read serial_counters"
ON public.serial_counters FOR SELECT TO authenticated
USING (public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read role definitions" ON public.role_definitions;
CREATE POLICY "Active users can read role definitions"
ON public.role_definitions FOR SELECT TO authenticated
USING (public.is_active_user(auth.uid()));

-- Onboarding / pending-approval users still need to read reference data to
-- complete sign-up. Allow SELECT for users whose profile exists but is not yet
-- approved (banned users remain blocked).
CREATE POLICY "Pending users can read departments for onboarding"
ON public.departments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.banned_at IS NULL));

CREATE POLICY "Pending users can read legal entities for onboarding"
ON public.legal_entities FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.banned_at IS NULL));

CREATE POLICY "Pending users can read office sites for onboarding"
ON public.office_sites FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.banned_at IS NULL));

-- 2) letterhead_templates: require active user to manage.
DROP POLICY IF EXISTS "Permitted users can insert templates" ON public.letterhead_templates;
DROP POLICY IF EXISTS "Permitted users can update templates" ON public.letterhead_templates;
DROP POLICY IF EXISTS "Permitted users can delete templates" ON public.letterhead_templates;

CREATE POLICY "Active permitted users can insert templates"
ON public.letterhead_templates FOR INSERT TO authenticated
WITH CHECK (public.is_active_user(auth.uid())
  AND public.user_has_permission(auth.uid(), 'manage_templates'));

CREATE POLICY "Active permitted users can update templates"
ON public.letterhead_templates FOR UPDATE TO authenticated
USING (public.is_active_user(auth.uid())
  AND public.user_has_permission(auth.uid(), 'manage_templates'))
WITH CHECK (public.is_active_user(auth.uid())
  AND public.user_has_permission(auth.uid(), 'manage_templates'));

CREATE POLICY "Active permitted users can delete templates"
ON public.letterhead_templates FOR DELETE TO authenticated
USING (public.is_active_user(auth.uid())
  AND public.user_has_permission(auth.uid(), 'manage_templates'));

-- 3) Lock down SECURITY DEFINER functions to authenticated callers only.
REVOKE EXECUTE ON FUNCTION public.list_pending_approvals() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role_scoped(uuid, public.app_role, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_in_scope(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_active_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_department(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_legal_entity(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_site(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_activity(text, text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_serial_number(text, text, boolean, integer, boolean, text, text, boolean, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_pending_approvals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_scoped(uuid, public.app_role, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_in_scope(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_department(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_legal_entity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_site(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_activity(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_serial_number(text, text, boolean, integer, boolean, text, text, boolean, boolean) TO authenticated;
