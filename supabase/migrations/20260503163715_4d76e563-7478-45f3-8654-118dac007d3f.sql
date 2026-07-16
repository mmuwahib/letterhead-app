REVOKE EXECUTE ON FUNCTION public.approve_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_pending_approvals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_approvals() TO authenticated;