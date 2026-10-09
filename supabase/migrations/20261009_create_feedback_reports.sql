-- Retroalimentación de Econexo a cada empresa.
--
-- Un informe por empresa y período (mes, trimestre o rango libre) con un
-- resumen y una lista de puntos (hallazgo / sugerencia / logro) en JSON.
-- El admin lo redacta como borrador y lo publica; la empresa solo ve los
-- publicados y solo puede marcar la lectura, con mark_feedback_read.
--
-- Se corre a mano en el SQL Editor.

-- Misma definición que en 20260824_security_hardening.sql. Se repite aquí
-- porque esa migración puede no estar aplicada; CREATE OR REPLACE no cambia
-- nada si ya existe.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true);
$$;

CREATE TABLE IF NOT EXISTS public.feedback_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  period_label  text NOT NULL,
  summary       text NOT NULL DEFAULT '',
  items         jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at  timestamptz,
  read_at       timestamptz,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_feedback_reports_company_period
  ON public.feedback_reports (company_id, period_start DESC);

ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage feedback" ON public.feedback_reports;
CREATE POLICY "Admins manage feedback" ON public.feedback_reports
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Companies read own published feedback" ON public.feedback_reports;
CREATE POLICY "Companies read own published feedback" ON public.feedback_reports
  FOR SELECT USING (company_id = auth.uid() AND status = 'published');

-- La empresa no tiene UPDATE: así no puede tocar el contenido. La lectura se
-- marca con esta función, que solo escribe read_at la primera vez.
CREATE OR REPLACE FUNCTION public.mark_feedback_read(report_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.feedback_reports
     SET read_at = now()
   WHERE id = report_id
     AND company_id = auth.uid()
     AND status = 'published'
     AND read_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.mark_feedback_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_feedback_read(uuid) TO authenticated;

-- Comprobación: deben salir las dos políticas.
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'feedback_reports';
