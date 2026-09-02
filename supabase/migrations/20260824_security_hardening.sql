-- ═══════════════════════════════════════════════════════════════════════════
-- Endurecimiento de seguridad · propuesta
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  NO se aplica solo. Cada bloque está numerado y explicado; revísalos y
--     ejecútalos de uno en uno en Supabase → SQL Editor, comprobando la app
--     entre bloque y bloque. Los bloques 1 y 2 tocan permisos en uso.
--
-- Antes de empezar: haz un backup (Supabase → Database → Backups).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1 · increment_points solo para administradores
-- ─────────────────────────────────────────────────────────────────────────
-- Hoy la función es SECURITY DEFINER y PostgREST la expone a cualquier usuario
-- con sesión. Es decir: alguien puede llamarla contra su propio id y regalarse
-- todos los Eco-Puntos que quiera, sin dejar fila en points_transactions.
--
-- Los dos usos reales (Dashboard "Operario" y panel Admin) son de administrador,
-- así que basta con comprobar is_admin dentro de la función.
--
-- ANTES DE APLICAR: confirma que ningún flujo de cliente normal la invoque.

CREATE OR REPLACE FUNCTION public.increment_points(user_id_param UUID, amount_param INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Solo un administrador puede modificar Eco-Puntos';
  END IF;

  -- Los puntos no bajan de cero aunque se reviertan certificados de más.
  UPDATE public.profiles
  SET eco_points = GREATEST(0, COALESCE(eco_points, 0) + amount_param)
  WHERE id = user_id_param;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_points(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_points(UUID, INTEGER) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- 2 · Quitar el atajo por correo de las políticas RLS
-- ─────────────────────────────────────────────────────────────────────────
-- Varias políticas confían en  auth.jwt() ->> 'email' = 'econexo.hub@gmail.com'.
-- Eso es frágil por tres motivos: el claim 'email' no se revalida hasta que el
-- token se refresca, el día que cambies de correo pierdes el acceso de golpe, y
-- no escala a un segundo administrador. La bandera is_admin ya cubre el caso.
--
-- ANTES DE APLICAR: comprueba que tu perfil tiene is_admin = true.
--   SELECT id, is_admin FROM public.profiles
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'econexo.hub@gmail.com');

-- Función auxiliar: una sola definición de "quién es admin".
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true);
$$;

DROP POLICY IF EXISTS "Admins can insert documents for anyone" ON public.documents;
CREATE POLICY "Admins can insert documents for anyone"
ON public.documents FOR INSERT
WITH CHECK (public.is_admin() OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all transactions" ON public.points_transactions;
CREATE POLICY "Admins can manage all transactions"
ON public.points_transactions FOR ALL
USING (public.is_admin());

DROP POLICY IF EXISTS "scanned_docs_select" ON storage.objects;
CREATE POLICY "scanned_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'scanned-docs' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "scanned_docs_insert" ON storage.objects;
CREATE POLICY "scanned_docs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'scanned-docs' AND public.is_admin());

DROP POLICY IF EXISTS "scanned_docs_update" ON storage.objects;
CREATE POLICY "scanned_docs_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'scanned-docs' AND public.is_admin());

DROP POLICY IF EXISTS "scanned_docs_delete" ON storage.objects;
CREATE POLICY "scanned_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'scanned-docs' AND public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────
-- 3 · Cerrar el bucket público 'documents'
-- ─────────────────────────────────────────────────────────────────────────
-- El bucket 'documents' es público: cualquiera con la URL —o adivinándola—
-- descarga certificados y guías de tus clientes sin iniciar sesión.
--
-- El código ya no sube nada ahí (las subidas nuevas van a 'scanned-docs', que es
-- privado y se sirve con URL firmada). Falta migrar lo que ya está subido.
--
-- 3.1 · Cuántas filas apuntan todavía al bucket público:
--   SELECT count(*) FROM public.documents
--   WHERE content_url LIKE '%/storage/v1/object/public/documents/%';
--
-- 3.2 · Copia los objetos de 'documents' a 'scanned-docs' conservando la ruta
--       (hazlo desde el panel de Storage o con la CLI; SQL no mueve binarios).
--
-- 3.3 · Reescribe las URL a rutas relativas. La app ya distingue los dos
--       formatos: URL absoluta → se abre directo; ruta → URL firmada de 60 s.
--
--   UPDATE public.documents
--   SET content_url = regexp_replace(
--         content_url, '^.*/storage/v1/object/public/documents/', ''
--       )
--   WHERE content_url LIKE '%/storage/v1/object/public/documents/%';
--
-- 3.4 · Recién entonces, cerrar el bucket:
--   UPDATE storage.buckets SET public = false WHERE id = 'documents';


-- ─────────────────────────────────────────────────────────────────────────
-- 4 · Política de borrado que faltaba en notifications
-- ─────────────────────────────────────────────────────────────────────────
-- Sin ella nadie puede limpiar sus avisos: la tabla crece sin tope.

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────
-- 5 · Poner en el repositorio lo que solo existe en la base
-- ─────────────────────────────────────────────────────────────────────────
-- Estas dos piezas están en producción pero NO en supabase/migrations/, así que
-- no se pueden auditar ni reconstruir si hay que levantar el proyecto de cero.
-- Vuelca su definición y guárdala junto a las demás migraciones:
--
--   SELECT pg_get_functiondef(oid)
--   FROM pg_proc WHERE proname = 'create_admin_document';
--
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies WHERE tablename = 'profiles';
--
-- Comprueba de paso que create_admin_document valide is_admin por dentro:
-- es SECURITY DEFINER y escribe filas a nombre de cualquier usuario.


-- ─────────────────────────────────────────────────────────────────────────
-- 6 · Revisión periódica
-- ─────────────────────────────────────────────────────────────────────────
-- Tablas del esquema público sin RLS activada (deberían ser cero):
--
--   SELECT tablename FROM pg_tables t
--   WHERE schemaname = 'public'
--     AND NOT EXISTS (
--       SELECT 1 FROM pg_class c
--       JOIN pg_namespace n ON n.oid = c.relnamespace
--       WHERE c.relname = t.tablename AND n.nspname = 'public' AND c.relrowsecurity
--     );
--
-- Y usa el panel Advisors de Supabase (Database → Advisors) después de cada
-- cambio de esquema: detecta RLS ausente y funciones con search_path mutable.
