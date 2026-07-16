
-- 1. Helper: is the current user approved and not banned?
CREATE OR REPLACE FUNCTION public.is_active_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND approved_at IS NOT NULL
      AND banned_at IS NULL
  )
$$;

-- 2. Lock down profile self-update: prevent users from changing approved_at / banned_at
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND approved_at IS NOT DISTINCT FROM (SELECT p.approved_at FROM public.profiles p WHERE p.user_id = auth.uid())
  AND banned_at IS NOT DISTINCT FROM (SELECT p.banned_at FROM public.profiles p WHERE p.user_id = auth.uid())
);

-- 3. Activity logs: replace direct INSERT policy with a SECURITY DEFINER RPC
DROP POLICY IF EXISTS "Users can insert own logs" ON public.activity_logs;

CREATE OR REPLACE FUNCTION public.log_activity(
  _action text,
  _description text,
  _serial_number text DEFAULT NULL,
  _target_type text DEFAULT NULL,
  _target_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile public.profiles%ROWTYPE;
  _le_name text;
  _site_name text;
  _dept_name text;
  _allowed_actions text[] := ARRAY[
    'create','download','view','update','delete','login','logout',
    'approve','ban','unban','role_change','template_create','template_update','template_delete'
  ];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _action IS NULL OR NOT (_action = ANY(_allowed_actions)) THEN
    RAISE EXCEPTION 'Invalid action: %', _action;
  END IF;

  IF length(coalesce(_description,'')) = 0 OR length(_description) > 1000 THEN
    RAISE EXCEPTION 'Invalid description length';
  END IF;

  SELECT * INTO _profile FROM public.profiles WHERE user_id = auth.uid();

  IF _profile.approved_at IS NULL OR _profile.banned_at IS NOT NULL THEN
    RAISE EXCEPTION 'User not active';
  END IF;

  SELECT name INTO _le_name   FROM public.legal_entities WHERE id = _profile.legal_entity_id;
  SELECT name INTO _site_name FROM public.office_sites    WHERE id = _profile.office_site_id;
  SELECT name INTO _dept_name FROM public.departments     WHERE id = _profile.department_id;

  INSERT INTO public.activity_logs(
    action, description, serial_number,
    user_id, user_name,
    department_id, department_name,
    legal_entity_id, legal_entity_name,
    office_site_id, office_site_name,
    target_type, target_id
  ) VALUES (
    _action, _description, _serial_number,
    auth.uid(), _profile.full_name,
    _profile.department_id, _dept_name,
    _profile.legal_entity_id, _le_name,
    _profile.office_site_id, _site_name,
    _target_type, _target_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_activity(text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_activity(text,text,text,text,text) TO authenticated;

-- 4. Gate data access on approved + not-banned
-- documents
DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
CREATE POLICY "Users can view own documents" ON public.documents
FOR SELECT TO authenticated
USING (auth.uid() = user_id AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Managers can view department documents" ON public.documents;
CREATE POLICY "Managers can view department documents" ON public.documents
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'manager'::app_role) AND department_id = get_user_department(auth.uid()) AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can insert documents" ON public.documents;
CREATE POLICY "Authenticated users can insert documents" ON public.documents
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_active_user(auth.uid()));

-- activity_logs read gates
DROP POLICY IF EXISTS "Users can view own logs" ON public.activity_logs;
CREATE POLICY "Users can view own logs" ON public.activity_logs
FOR SELECT TO authenticated
USING (auth.uid() = user_id AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Managers can view department logs" ON public.activity_logs;
CREATE POLICY "Managers can view department logs" ON public.activity_logs
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'manager'::app_role) AND department_id = get_user_department(auth.uid()) AND public.is_active_user(auth.uid()));

-- letterhead_templates read
DROP POLICY IF EXISTS "Users can read scoped templates" ON public.letterhead_templates;
CREATE POLICY "Users can read scoped templates" ON public.letterhead_templates
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'admin'::app_role)
  OR (
    public.is_active_user(auth.uid())
    AND (
      visibility = 'all'
      OR (visibility = 'legal_entity' AND legal_entity_id = get_user_legal_entity(auth.uid()))
      OR (visibility = 'site' AND office_site_id = get_user_site(auth.uid()))
    )
  )
);
