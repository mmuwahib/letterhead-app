
-- 1. Codes
ALTER TABLE public.legal_entities ADD COLUMN IF NOT EXISTS code text NOT NULL DEFAULT '';
ALTER TABLE public.office_sites ADD COLUMN IF NOT EXISTS code text NOT NULL DEFAULT '';

-- 2. Letterhead template extensions
ALTER TABLE public.letterhead_templates
  ADD COLUMN IF NOT EXISTS watermark_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS watermark_default_on boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS watermark_opacity numeric NOT NULL DEFAULT 0.12,
  ADD COLUMN IF NOT EXISTS legal_entity_id uuid NULL,
  ADD COLUMN IF NOT EXISTS office_site_id uuid NULL,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'all';

-- 3. Helpers
CREATE OR REPLACE FUNCTION public.get_user_legal_entity(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT legal_entity_id FROM public.profiles WHERE user_id = _user_id $$;

CREATE OR REPLACE FUNCTION public.get_user_site(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT office_site_id FROM public.profiles WHERE user_id = _user_id $$;

-- 4. Template scoped read policy
DROP POLICY IF EXISTS "Authenticated users can read templates" ON public.letterhead_templates;
DROP POLICY IF EXISTS "Users can read scoped templates" ON public.letterhead_templates;
CREATE POLICY "Users can read scoped templates"
ON public.letterhead_templates FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR visibility = 'all'
  OR (visibility = 'legal_entity' AND legal_entity_id = public.get_user_legal_entity(auth.uid()))
  OR (visibility = 'site' AND office_site_id = public.get_user_site(auth.uid()))
);

-- 5. Serial counters scope
ALTER TABLE public.serial_counters
  ADD COLUMN IF NOT EXISTS legal_entity text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS site text NOT NULL DEFAULT '';

ALTER TABLE public.serial_counters
  DROP CONSTRAINT IF EXISTS serial_counters_prefix_year_month_key;

CREATE UNIQUE INDEX IF NOT EXISTS serial_counters_scope_key
  ON public.serial_counters (prefix, legal_entity, site, year, month);

-- 6. New generate_serial_number signature
DROP FUNCTION IF EXISTS public.generate_serial_number(text, text, boolean, integer, boolean);
CREATE OR REPLACE FUNCTION public.generate_serial_number(
  _prefix text DEFAULT 'GC',
  _separator text DEFAULT '-',
  _include_month boolean DEFAULT true,
  _padding integer DEFAULT 4,
  _include_timestamp boolean DEFAULT false,
  _legal_entity_code text DEFAULT '',
  _site_code text DEFAULT '',
  _include_legal_entity boolean DEFAULT false,
  _include_site boolean DEFAULT false
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _year int; _month int; _count int; _result text; _now timestamptz; _le text; _si text;
BEGIN
  _now := now();
  _year := EXTRACT(YEAR FROM _now);
  _month := EXTRACT(MONTH FROM _now);
  _le := CASE WHEN _include_legal_entity THEN COALESCE(_legal_entity_code,'') ELSE '' END;
  _si := CASE WHEN _include_site THEN COALESCE(_site_code,'') ELSE '' END;

  INSERT INTO public.serial_counters (prefix, legal_entity, site, year, month, counter)
  VALUES (_prefix, _le, _si, _year, _month, 1)
  ON CONFLICT (prefix, legal_entity, site, year, month)
  DO UPDATE SET counter = serial_counters.counter + 1
  RETURNING counter INTO _count;

  _result := _prefix;
  IF _include_legal_entity AND _le <> '' THEN _result := _result || _separator || _le; END IF;
  IF _include_site AND _si <> '' THEN _result := _result || _separator || _si; END IF;
  _result := _result || _separator || _year::text;
  IF _include_month THEN _result := _result || _separator || LPAD(_month::text, 2, '0'); END IF;
  IF _include_timestamp THEN _result := _result || _separator || to_char(_now, 'YYYYMMDDHH24MI'); END IF;
  _result := _result || _separator || LPAD(_count::text, _padding, '0');
  RETURN _result;
END; $$;

-- 7. App settings
INSERT INTO public.app_settings (key, value) VALUES
  ('serial_include_legal_entity', 'false'::jsonb),
  ('serial_include_site', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 8. Storage policies for documents bucket
DROP POLICY IF EXISTS "Users can read own documents in storage" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own documents in storage" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read all documents in storage" ON storage.objects;

CREATE POLICY "Users can read own documents in storage"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own documents in storage"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can read all documents in storage"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'admin'::app_role));
