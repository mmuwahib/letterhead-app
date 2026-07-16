ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS document_title text,
  ADD COLUMN IF NOT EXISTS assigned_to text;
