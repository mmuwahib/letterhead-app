
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'public.has_role(uuid, public.app_role)',
    'public.has_role_scoped(uuid, public.app_role, text, uuid)',
    'public.get_user_department(uuid)',
    'public.get_user_legal_entity(uuid)',
    'public.get_user_site(uuid)',
    'public.is_active_user(uuid)',
    'public.user_has_permission(uuid, text)',
    'public.user_in_scope(uuid, text, uuid)'
  ]) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;
