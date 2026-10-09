-- Cierra dos huecos de profiles que muestra pg_policies en producción
-- (2026-10-09):
--
-- 1. «Usuarios y Admins actualizan perfiles» deja que cada usuario edite SU
--    fila sin restringir columnas: una empresa podía ponerse is_admin = true
--    (y con eso leer y escribir todo) o reactivarse estando suspendida. El
--    INSERT tenía el mismo problema al registrarse.
-- 2. «Perfiles visibles por todos» (qual = true) dejaba leer todos los
--    perfiles —RUT, correos, teléfonos— a cualquiera con la clave pública.
--    En la app solo el admin lee perfiles ajenos.
--
-- is_admin e is_active quedan como columnas que solo cambia un admin (o el
-- SQL Editor / Edge Functions con service role).
--
-- ANTES DE APLICAR: comprueba que tu perfil tiene is_admin = true.
--   SELECT id, company_name, is_admin FROM public.profiles WHERE is_admin;
--
-- Se corre a mano en el SQL Editor.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true);
$$;

-- ── 1 · Columnas privilegiadas ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Solo se limita a los roles de la API (la app). Service role, SQL Editor
  -- y administradores pasan sin límites.
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_admin, false) THEN
      RAISE EXCEPTION 'No autorizado: is_admin solo lo asigna un administrador';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'No autorizado: is_admin solo lo cambia un administrador';
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'No autorizado: is_active solo lo cambia un administrador';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_privileges ON public.profiles;
CREATE TRIGGER protect_profile_privileges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();

-- ── 2 · Lectura: el propio perfil, o todos si es admin ─────────────────────
-- Las políticas de otras tablas que consultan profiles (id = auth.uid())
-- siguen funcionando: leen solo la fila propia.
DROP POLICY IF EXISTS "Perfiles visibles por todos" ON public.profiles;
DROP POLICY IF EXISTS "Usuarios ven su perfil y admins todos" ON public.profiles;
CREATE POLICY "Usuarios ven su perfil y admins todos" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());

-- ── 3 · Escritura: misma regla, ahora también en WITH CHECK ────────────────
DROP POLICY IF EXISTS "Usuarios y Admins actualizan perfiles" ON public.profiles;
CREATE POLICY "Usuarios y Admins actualizan perfiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- Comprobación:
--   SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE tablename = 'profiles';
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal;
