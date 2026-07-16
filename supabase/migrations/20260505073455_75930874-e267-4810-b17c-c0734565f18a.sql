ALTER TABLE public.letterhead_templates
ADD COLUMN IF NOT EXISTS reference_format jsonb NOT NULL DEFAULT '{"segments":["PREFIX","COMPANY","DEPT","DATE","COUNTER"]}'::jsonb;