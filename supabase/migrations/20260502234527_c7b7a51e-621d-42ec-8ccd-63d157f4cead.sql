
DROP POLICY IF EXISTS "Public read watermarks" ON storage.objects;

CREATE POLICY "Admins can list watermarks"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'watermarks' AND public.has_role(auth.uid(), 'admin'::public.app_role));
