
-- Watermark image fields
ALTER TABLE public.letterhead_templates
  ADD COLUMN IF NOT EXISTS watermark_image_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS watermark_type text NOT NULL DEFAULT 'text';

-- Admin write policies for entities/sites/departments
DROP POLICY IF EXISTS "Admins manage legal entities" ON public.legal_entities;
CREATE POLICY "Admins manage legal entities" ON public.legal_entities
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage office sites" ON public.office_sites;
CREATE POLICY "Admins manage office sites" ON public.office_sites
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage departments" ON public.departments;
CREATE POLICY "Admins manage departments" ON public.departments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Public watermarks bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('watermarks', 'watermarks', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read watermarks" ON storage.objects;
CREATE POLICY "Public read watermarks" ON storage.objects
  FOR SELECT USING (bucket_id = 'watermarks');

DROP POLICY IF EXISTS "Admins write watermarks" ON storage.objects;
CREATE POLICY "Admins write watermarks" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'watermarks' AND has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update watermarks" ON storage.objects;
CREATE POLICY "Admins update watermarks" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'watermarks' AND has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete watermarks" ON storage.objects;
CREATE POLICY "Admins delete watermarks" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'watermarks' AND has_role(auth.uid(), 'admin'));
