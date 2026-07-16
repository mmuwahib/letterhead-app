ALTER TABLE public.letterhead_templates
  ADD COLUMN IF NOT EXISTS background_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS overlay_config jsonb NOT NULL DEFAULT '{}'::jsonb;