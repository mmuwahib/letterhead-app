ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS sensitivity text NOT NULL DEFAULT 'general';
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS sensitivity text;