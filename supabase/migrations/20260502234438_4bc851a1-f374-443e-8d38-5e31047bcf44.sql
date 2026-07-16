
-- 1) Storage: allow owners + admins to UPDATE/DELETE objects in the private 'documents' bucket
CREATE POLICY "Users can update own documents in storage"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'documents' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'documents' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own documents in storage"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can update any document in storage"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete any document in storage"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2) serial_counters: explicit admin-only write policies (the table is normally written via SECURITY DEFINER RPC, never directly by users)
CREATE POLICY "Only admins can insert serial_counters"
ON public.serial_counters FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Only admins can update serial_counters"
ON public.serial_counters FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Only admins can delete serial_counters"
ON public.serial_counters FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Lock down SECURITY DEFINER helper functions: revoke EXECUTE from anon/authenticated.
-- They are still callable from within RLS policies (which run as the policy owner) and from
-- other SECURITY DEFINER functions. They were never intended to be callable as RPCs.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_department(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_legal_entity(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_site(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- generate_serial_number IS intentionally exposed: it is called from the client via supabase.rpc()
-- during document creation. Keep it callable by authenticated users only, never by anon.
REVOKE EXECUTE ON FUNCTION public.generate_serial_number(text, text, boolean, integer, boolean, text, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_serial_number(text, text, boolean, integer, boolean, text, text, boolean, boolean) TO authenticated;
