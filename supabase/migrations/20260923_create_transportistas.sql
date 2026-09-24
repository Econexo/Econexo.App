-- ═══════════════════════════════════════════════════════════════════════════
-- Transportistas autorizados
-- ═══════════════════════════════════════════════════════════════════════════
-- El Certificado de Transporte declara la resolución sanitaria que autoriza el
-- traslado. Hasta ahora era un número fijo escrito dentro del generador de PDF
-- (el de EcoNexo). Cuando el retiro lo hace un tercero, el certificado tiene que
-- declarar SU resolución, no la de EcoNexo.
--
-- Esta tabla guarda los transportistas y su resolución. El elegido al emitir
-- queda copiado en metadata.transporter del documento: si mañana cambias la
-- resolución de un transportista, los certificados ya entregados conservan la
-- que llevaban impresa.
--
-- Mismo patrón y mismas políticas que cgm_destinations (20260630).
--
-- ⚠️  Ejecútala en el SQL Editor de Supabase. Es idempotente: se puede volver a
--     correr sin efecto.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.transportistas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  rut TEXT NOT NULL DEFAULT '',
  -- Solo el número. El PDF ya imprime el rótulo "RESOLUCIÓN N° :".
  resolution TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transportistas_active ON public.transportistas(active);

ALTER TABLE public.transportistas ENABLE ROW LEVEL SECURITY;

-- Lectura para cualquier autenticado: la emisión ya está restringida en la app.
DROP POLICY IF EXISTS "Authenticated can view transportistas" ON public.transportistas;
CREATE POLICY "Authenticated can view transportistas"
  ON public.transportistas FOR SELECT
  USING (auth.role() = 'authenticated');

-- Crear, editar y eliminar: solo admin.
DROP POLICY IF EXISTS "Admins can insert transportistas" ON public.transportistas;
CREATE POLICY "Admins can insert transportistas"
  ON public.transportistas FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    OR auth.jwt() ->> 'email' = 'econexo.hub@gmail.com'
  );

DROP POLICY IF EXISTS "Admins can update transportistas" ON public.transportistas;
CREATE POLICY "Admins can update transportistas"
  ON public.transportistas FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    OR auth.jwt() ->> 'email' = 'econexo.hub@gmail.com'
  );

DROP POLICY IF EXISTS "Admins can delete transportistas" ON public.transportistas;
CREATE POLICY "Admins can delete transportistas"
  ON public.transportistas FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    OR auth.jwt() ->> 'email' = 'econexo.hub@gmail.com'
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Semilla: el transportista que estaba escrito en el PDF
-- ─────────────────────────────────────────────────────────────────────────
-- Queda primero en el orden por created_at, así es el preseleccionado al emitir
-- y nada cambia para quien no toque el selector.

INSERT INTO public.transportistas (name, rut, resolution)
SELECT 'EcoNexo SpA', '77.855.394-5', '2402341155'
WHERE NOT EXISTS (SELECT 1 FROM public.transportistas WHERE rut = '77.855.394-5');

-- ─────────────────────────────────────────────────────────────────────────
-- Verificación
-- ─────────────────────────────────────────────────────────────────────────
--   SELECT name, rut, resolution, active FROM public.transportistas ORDER BY created_at;
