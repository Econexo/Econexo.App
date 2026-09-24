-- ═══════════════════════════════════════════════════════════════════════════
-- Integridad de los certificados: el cliente no puede fabricarlos ni alterarlos
-- ═══════════════════════════════════════════════════════════════════════════
-- HOY: las tres políticas de escritura de public.documents terminan en
--   OR auth.uid() = user_id
-- Es decir, cualquier usuario con sesión puede, llamando a la API con la clave
-- anónima (que va en el bundle y es pública por diseño):
--
--   · insertarse un CT con verified = true y los kilos que quiera,
--   · editar los kilos de un certificado que EcoNexo le emitió,
--   · borrar el certificado que le incomode.
--
-- Y eso no se queda en su cuenta: el CGM que firma EcoNexo agrega esas mismas
-- filas, igual que los totales de Impacto y las cifras con que el cliente
-- declara ante la autoridad. Un cliente infla sus kilos y EcoNexo se los
-- certifica.
--
-- DESPUÉS: los cuatro tipos que emite EcoNexo —CT, CR (código anterior),
-- COMMUNITY_CR y CGM— solo los puede crear, modificar o borrar un administrador.
-- Todo lo demás sigue igual: el cliente administra los documentos de terceros
-- que sube y su propio reporte de impacto.
--
-- ⚠️  Ejecuta los bloques en orden. El 0 solo consulta.
-- ⚠️  Haz un backup antes del bloque 2 (Database → Backups).
-- ⚠️  El código que acompaña esta migración deja de ofrecerle al cliente el
--     botón de borrar en esos certificados. Conviene aplicar esto con el deploy
--     ya en producción: si no, el botón sigue visible y no hará nada.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 0 · Qué políticas hay hoy (solo consulta)
-- ─────────────────────────────────────────────────────────────────────────
-- Guarda este resultado antes de seguir: es tu punto de retorno. El bloque 2
-- borra TODAS las políticas de la tabla y crea cuatro nuevas, porque las
-- políticas de Postgres se suman con OR: basta con que sobreviva una permisiva
-- para que el agujero siga abierto.

SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'documents'
ORDER BY cmd, policyname;


-- ─────────────────────────────────────────────────────────────────────────
-- 1 · Dos funciones auxiliares
-- ─────────────────────────────────────────────────────────────────────────
-- Una sola definición de "quién es admin" y de "qué es un certificado nuestro".
-- Tener la lista en un solo lugar evita que una política quede desalineada de
-- las otras cuando mañana se agregue un tipo.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true);
$$;

-- Nota: ya no se incluye el atajo por correo
-- (auth.jwt() ->> 'email' = 'econexo.hub@gmail.com') que arrastraban las
-- políticas viejas. El claim 'email' no se revalida hasta que el token se
-- refresca, el día que cambies de correo pierdes el acceso de golpe, y no
-- escala a un segundo administrador. La bandera is_admin ya cubre el caso.
--
-- ⚠️  ANTES DE SEGUIR, comprueba que tu perfil la tenga puesta:
--   SELECT p.id, p.is_admin FROM public.profiles p
--   JOIN auth.users u ON u.id = p.id
--   WHERE u.email = 'econexo.hub@gmail.com';
-- Si devuelve is_admin = false o ninguna fila, PARA AQUÍ: aplicar el bloque 2
-- te dejaría fuera de tu propio panel.

CREATE OR REPLACE FUNCTION public.is_econexo_certificate(doc_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  -- CT  · Certificado de Transporte (lo emite EcoNexo al retirar)
  -- CR  · el mismo documento con su código anterior, por el histórico
  -- COMMUNITY_CR · retiro comunitario
  -- CGM · Certificado de Gestión Mensual
  SELECT doc_type IN ('CT', 'CR', 'COMMUNITY_CR', 'CGM');
$$;


-- ─────────────────────────────────────────────────────────────────────────
-- 2 · Políticas nuevas (reemplazan TODAS las anteriores)
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

-- Borra cualquier política que exista hoy sobre la tabla, conocida o no.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'documents'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.documents', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Lectura: sin cambios. Cada uno ve lo suyo; el admin ve todo.
CREATE POLICY "documents_select"
  ON public.documents FOR SELECT TO authenticated
  USING (public.is_admin() OR auth.uid() = user_id);

-- Creación: el cliente puede subir sus documentos, pero no fabricar certificados.
CREATE POLICY "documents_insert"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (auth.uid() = user_id AND NOT public.is_econexo_certificate(type))
  );

-- Modificación: el USING mira la fila como está, el WITH CHECK cómo queda. Los
-- dos hacen falta: sin el segundo, el cliente podría tomar un documento suyo
-- cualquiera y convertirlo en un CT cambiándole el tipo.
CREATE POLICY "documents_update"
  ON public.documents FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (auth.uid() = user_id AND NOT public.is_econexo_certificate(type))
  )
  WITH CHECK (
    public.is_admin()
    OR (auth.uid() = user_id AND NOT public.is_econexo_certificate(type))
  );

-- Borrado: un certificado emitido no lo elimina quien lo recibió.
CREATE POLICY "documents_delete"
  ON public.documents FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR (auth.uid() = user_id AND NOT public.is_econexo_certificate(type))
  );

COMMIT;
-- Si algo se ve mal, ROLLBACK; en vez de COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- 3 · El trigger que tapa la otra puerta
-- ─────────────────────────────────────────────────────────────────────────
-- RLS no alcanza para cerrar el caso: create_admin_document es SECURITY DEFINER
-- y escribe filas a nombre de cualquier usuario, lo que salta las políticas de
-- arriba. Si esa función no comprueba is_admin por dentro —está en la base pero
-- no en este repositorio, así que no se puede auditar desde aquí— un cliente la
-- llama y se inserta el CT que quiera.
--
-- Un trigger sí se ejecuta dentro de una función SECURITY DEFINER, y auth.uid()
-- sigue devolviendo el usuario real de la sesión. Con esto el tipo protegido
-- queda cerrado por los dos caminos, sin tener que reescribir a ciegas una
-- función cuyo cuerpo no conozco.

CREATE OR REPLACE FUNCTION public.documents_guard_certificates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_type text := COALESCE(NEW.type, OLD.type);
BEGIN
  -- service_role no tiene sesión (auth.uid() es NULL): es el backend, que ya
  -- pasó por su propia autenticación. Hoy las edge functions solo leen, pero si
  -- mañana una escribe, esto evita que el trigger la bloquee sin explicación.
  IF auth.role() = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF public.is_econexo_certificate(affected_type) AND NOT public.is_admin() THEN
    RAISE EXCEPTION
      'Solo un administrador puede crear, modificar o eliminar un certificado emitido por EcoNexo (tipo %).',
      affected_type
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS documents_guard_certificates ON public.documents;
CREATE TRIGGER documents_guard_certificates
  BEFORE INSERT OR UPDATE OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_guard_certificates();


-- ─────────────────────────────────────────────────────────────────────────
-- 4 · Comprobación
-- ─────────────────────────────────────────────────────────────────────────
-- 4.1 · Deben quedar exactamente estas cuatro políticas:
--
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'documents' ORDER BY cmd;
--
--   documents_delete  DELETE
--   documents_insert  INSERT
--   documents_select  SELECT
--   documents_update  UPDATE
--
-- 4.2 · Y el trigger:
--
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgrelid = 'public.documents'::regclass AND NOT tgisinternal;
--
-- 4.3 · Prueba de fuego, con la sesión de un cliente (no admin), desde la app:
--       en la consola del navegador, estando logueado como cliente:
--
--   await supabase.from('documents').insert([{ user_id: (await supabase.auth.getUser()).data.user.id,
--     title: 'prueba', type: 'CT', verified: true }])
--
--       Debe devolver error (42501 o violación de RLS). Antes de esta migración
--       devolvía éxito.
--
-- 4.4 · Y que el admin siga pudiendo emitir: emite un CT de prueba desde el
--       panel y bórralo después. Si eso funciona, la migración está bien.


-- ─────────────────────────────────────────────────────────────────────────
-- 5 · Lo que queda pendiente aparte de esto
-- ─────────────────────────────────────────────────────────────────────────
-- create_admin_document sigue sin estar en el repositorio. El trigger ya
-- protege los tipos que importan, pero conviene volcar su definición y guardarla
-- junto a las migraciones, y comprobar que valide is_admin por dentro:
--
--   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'create_admin_document';
--
-- Si el cuerpo no menciona is_admin, un cliente puede seguir usándola para
-- insertarse documentos de los tipos NO protegidos a nombre de otro usuario.
