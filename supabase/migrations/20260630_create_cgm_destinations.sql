-- Authorized destinations for the CGM (Certificado Gestión Mensual)
CREATE TABLE IF NOT EXISTS public.cgm_destinations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  rut TEXT NOT NULL DEFAULT '',
  resolution TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cgm_destinations_active ON public.cgm_destinations(active);

ALTER TABLE public.cgm_destinations ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read (generation is admin-gated in the app)
DROP POLICY IF EXISTS "Authenticated can view destinations" ON public.cgm_destinations;
CREATE POLICY "Authenticated can view destinations"
  ON public.cgm_destinations FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins can create/update/delete
DROP POLICY IF EXISTS "Admins can insert destinations" ON public.cgm_destinations;
CREATE POLICY "Admins can insert destinations"
  ON public.cgm_destinations FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    OR auth.jwt() ->> 'email' = 'econexo.hub@gmail.com'
  );

DROP POLICY IF EXISTS "Admins can update destinations" ON public.cgm_destinations;
CREATE POLICY "Admins can update destinations"
  ON public.cgm_destinations FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    OR auth.jwt() ->> 'email' = 'econexo.hub@gmail.com'
  );

DROP POLICY IF EXISTS "Admins can delete destinations" ON public.cgm_destinations;
CREATE POLICY "Admins can delete destinations"
  ON public.cgm_destinations FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    OR auth.jwt() ->> 'email' = 'econexo.hub@gmail.com'
  );

-- Seed with the destinations that were previously hardcoded
INSERT INTO public.cgm_destinations (name, rut, resolution)
SELECT 'SOREPA SPA.', '86.359.300-K', 'Resolución N°7621 SEREMI DE SALUD ANTOFAGASTA'
WHERE NOT EXISTS (SELECT 1 FROM public.cgm_destinations WHERE rut = '86.359.300-K');

INSERT INTO public.cgm_destinations (name, rut, resolution)
SELECT 'GCR', '76.958.842-6', 'Resolución N°2248, SEREMI DE SALUD ANTOFAGASTA'
WHERE NOT EXISTS (SELECT 1 FROM public.cgm_destinations WHERE rut = '76.958.842-6');
