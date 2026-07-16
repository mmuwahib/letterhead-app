CREATE OR REPLACE FUNCTION public.list_pending_approvals()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  department_id uuid,
  department_name text,
  legal_entity_id uuid,
  legal_entity_name text,
  office_site_id uuid,
  office_site_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role);
  _has_perm boolean := public.user_has_permission(auth.uid(), 'approve_users');
  _dept uuid := public.get_user_department(auth.uid());
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  IF NOT (_is_admin OR _has_perm) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT p.user_id,
         p.full_name,
         u.email::text,
         p.department_id, d.name,
         p.legal_entity_id, le.name,
         p.office_site_id, os.name,
         p.created_at
  FROM public.profiles p
  LEFT JOIN auth.users u           ON u.id = p.user_id
  LEFT JOIN public.departments d   ON d.id = p.department_id
  LEFT JOIN public.legal_entities le ON le.id = p.legal_entity_id
  LEFT JOIN public.office_sites os ON os.id = p.office_site_id
  WHERE p.approved_at IS NULL
    AND p.banned_at IS NULL
    AND (
      _is_admin
      OR (_dept IS NOT NULL AND p.department_id = _dept)
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_pending_approvals() TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role);
  _has_perm boolean := public.user_has_permission(auth.uid(), 'approve_users');
  _dept uuid := public.get_user_department(auth.uid());
  _target_dept uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (_is_admin OR _has_perm) THEN
    RAISE EXCEPTION 'Not authorized to approve users';
  END IF;
  SELECT department_id INTO _target_dept
  FROM public.profiles
  WHERE user_id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF NOT _is_admin THEN
    IF _target_dept IS NULL OR _dept IS NULL OR _target_dept <> _dept THEN
      RAISE EXCEPTION 'User is outside your department';
    END IF;
  END IF;
  UPDATE public.profiles
  SET approved_at = COALESCE(approved_at, now())
  WHERE user_id = _user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_user(uuid) TO authenticated;