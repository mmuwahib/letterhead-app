-- Restore EXECUTE on RLS helper functions for authenticated users.
-- These are SECURITY DEFINER and used inside RLS policies; revoking from
-- authenticated broke all queries that depend on policies referencing them.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_department(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_legal_entity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_site(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid) TO authenticated;

-- Keep anon locked out of role/org helpers
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_department(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_legal_entity(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_site(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_active_user(uuid) FROM anon;