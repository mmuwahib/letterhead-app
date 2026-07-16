CREATE TABLE IF NOT EXISTS public.role_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  base_role public.app_role NOT NULL,
  scope_type text NOT NULL DEFAULT 'global'
    CHECK (scope_type IN ('global','legal_entity','site','department')),
  scope_id uuid,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.role_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read role definitions"
  ON public.role_definitions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage role definitions"
  ON public.role_definitions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER role_definitions_updated_at
  BEFORE UPDATE ON public.role_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role_definition_id uuid NOT NULL REFERENCES public.role_definitions(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid,
  UNIQUE (user_id, role_definition_id)
);

ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own assignments"
  ON public.user_role_assignments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all assignments"
  ON public.user_role_assignments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage assignments"
  ON public.user_role_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS user_role_assignments_user_idx
  ON public.user_role_assignments (user_id);
CREATE INDEX IF NOT EXISTS user_role_assignments_role_idx
  ON public.user_role_assignments (role_definition_id);

CREATE OR REPLACE FUNCTION public.user_has_permission(
  _user_id uuid,
  _permission text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_role_assignments a
      JOIN public.role_definitions r ON r.id = a.role_definition_id
      WHERE a.user_id = _user_id
        AND COALESCE((r.permissions ->> _permission)::boolean, false) = true
    )
$$;