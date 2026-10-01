-- Cierre mensual por gestor.
--
-- Cada fin de mes el admin asigna un gestor (cgm_destinations) a cada empresa
-- con retiros y guarda aquí una copia fija de lo enviado: un registro por mes y
-- gestor. Volver a cerrar el mes reemplaza el registro (upsert por
-- period + destination_id). Solo el admin lee y escribe.
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

CREATE TABLE IF NOT EXISTS public.monthly_closures (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period           text NOT NULL CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  destination_id   uuid NOT NULL REFERENCES public.cgm_destinations(id),
  destination_name text NOT NULL,
  companies        jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_kg         numeric NOT NULL DEFAULT 0,
  fingerprint      text NOT NULL DEFAULT '',
  closed_by        uuid REFERENCES auth.users(id),
  closed_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period, destination_id)
);

ALTER TABLE public.monthly_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read closures" ON public.monthly_closures;
CREATE POLICY "Admins read closures" ON public.monthly_closures
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert closures" ON public.monthly_closures;
CREATE POLICY "Admins insert closures" ON public.monthly_closures
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update closures" ON public.monthly_closures;
CREATE POLICY "Admins update closures" ON public.monthly_closures
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete closures" ON public.monthly_closures;
CREATE POLICY "Admins delete closures" ON public.monthly_closures
  FOR DELETE USING (public.is_admin());

-- Comprobación: deben salir las cuatro políticas.
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'monthly_closures';
