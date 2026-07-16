ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS office_site_id uuid,
  ADD COLUMN IF NOT EXISTS legal_entity_name text,
  ADD COLUMN IF NOT EXISTS office_site_name text;

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS legal_entity_id uuid,
  ADD COLUMN IF NOT EXISTS legal_entity_name text,
  ADD COLUMN IF NOT EXISTS office_site_id uuid,
  ADD COLUMN IF NOT EXISTS office_site_name text,
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS target_id text;

CREATE INDEX IF NOT EXISTS documents_legal_entity_idx ON public.documents(legal_entity_id);
CREATE INDEX IF NOT EXISTS documents_office_site_idx ON public.documents(office_site_id);
CREATE INDEX IF NOT EXISTS activity_logs_action_idx ON public.activity_logs(action);
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON public.activity_logs(created_at DESC);